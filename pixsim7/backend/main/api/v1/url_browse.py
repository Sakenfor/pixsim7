"""
URL Browse — fetch a page and extract media + navigation links.

Lightweight server-side HTML parser for browsing media on external sites.
No JS execution — extracts from raw HTML only.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser
from pixsim_logging import get_logger

logger = get_logger()
router = APIRouter(prefix="/tools", tags=["tools"])

# Reasonable limits
MAX_RESPONSE_SIZE = 5 * 1024 * 1024  # 5MB
REQUEST_TIMEOUT = 15.0
MAX_IMAGES = 200
MAX_LINKS = 100

# Media file extensions
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

# Skip patterns for navigation links
SKIP_LINK_PATTERNS = re.compile(
    r"(javascript:|mailto:|tel:|#$|\.pdf$|\.zip$|\.exe$|\.dmg$)",
    re.IGNORECASE,
)


class MediaItem(BaseModel):
    url: str
    alt: str = ""
    width: Optional[int] = None
    height: Optional[int] = None
    kind: str = "image"  # "image" or "video"


class NavLink(BaseModel):
    url: str
    text: str = ""


class BrowseResult(BaseModel):
    url: str = Field(description="The URL that was fetched")
    title: str = ""
    media: list[MediaItem] = Field(default_factory=list)
    links: list[NavLink] = Field(default_factory=list)
    error: Optional[str] = None


def _classify_url(url: str) -> Optional[str]:
    """Return 'image', 'video', or None based on URL extension."""
    path = urlparse(url).path.lower()
    for ext in IMAGE_EXTENSIONS:
        if path.endswith(ext):
            return "image"
    for ext in VIDEO_EXTENSIONS:
        if path.endswith(ext):
            return "video"
    return None


def _extract_media_and_links(html: str, base_url: str) -> tuple[list[MediaItem], list[NavLink], str]:
    """Extract images, videos, and navigation links from HTML."""
    from html.parser import HTMLParser

    media: list[MediaItem] = []
    links: list[NavLink] = []
    title = ""
    seen_media_urls: set[str] = set()
    seen_link_urls: set[str] = set()

    class Extractor(HTMLParser):
        nonlocal title
        _in_title = False
        _in_a = False
        _current_link_href: Optional[str] = None
        _current_link_text: list[str] = []

        def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]):
            nonlocal title
            attr_dict = {k: v for k, v in attrs if v is not None}

            if tag == "title":
                self._in_title = True

            elif tag == "img":
                src = attr_dict.get("src") or attr_dict.get("data-src")
                srcset = attr_dict.get("srcset")
                # Pick best from srcset if available
                if srcset and not src:
                    src = _best_from_srcset(srcset)
                if src:
                    abs_url = urljoin(base_url, src)
                    if abs_url not in seen_media_urls and len(media) < MAX_IMAGES:
                        seen_media_urls.add(abs_url)
                        w = _parse_int(attr_dict.get("width"))
                        h = _parse_int(attr_dict.get("height"))
                        media.append(MediaItem(
                            url=abs_url,
                            alt=attr_dict.get("alt", ""),
                            width=w,
                            height=h,
                            kind="image",
                        ))

            elif tag == "video":
                src = attr_dict.get("src")
                poster = attr_dict.get("poster")
                if src:
                    abs_url = urljoin(base_url, src)
                    if abs_url not in seen_media_urls and len(media) < MAX_IMAGES:
                        seen_media_urls.add(abs_url)
                        media.append(MediaItem(url=abs_url, kind="video"))
                if poster:
                    abs_url = urljoin(base_url, poster)
                    if abs_url not in seen_media_urls and len(media) < MAX_IMAGES:
                        seen_media_urls.add(abs_url)
                        media.append(MediaItem(url=abs_url, kind="image", alt="video poster"))

            elif tag == "source":
                src = attr_dict.get("src")
                if src:
                    abs_url = urljoin(base_url, src)
                    kind = _classify_url(abs_url) or "video"
                    if abs_url not in seen_media_urls and len(media) < MAX_IMAGES:
                        seen_media_urls.add(abs_url)
                        media.append(MediaItem(url=abs_url, kind=kind))

            elif tag == "a":
                href = attr_dict.get("href")
                if href and not SKIP_LINK_PATTERNS.search(href):
                    self._in_a = True
                    self._current_link_href = urljoin(base_url, href)
                    self._current_link_text = []

            # Check background-image in style attribute
            style = attr_dict.get("style", "")
            if "background-image" in style:
                match = re.search(r'url\(["\']?([^"\')\s]+)', style)
                if match:
                    abs_url = urljoin(base_url, match.group(1))
                    if abs_url not in seen_media_urls and len(media) < MAX_IMAGES:
                        seen_media_urls.add(abs_url)
                        media.append(MediaItem(url=abs_url, kind="image"))

            # og:image meta tags
            if tag == "meta":
                prop = attr_dict.get("property", "")
                if prop in ("og:image", "og:video", "twitter:image"):
                    content = attr_dict.get("content")
                    if content:
                        abs_url = urljoin(base_url, content)
                        kind = "video" if "video" in prop else "image"
                        if abs_url not in seen_media_urls and len(media) < MAX_IMAGES:
                            seen_media_urls.add(abs_url)
                            media.append(MediaItem(url=abs_url, kind=kind, alt=f"from {prop}"))

        def handle_data(self, data: str):
            if self._in_title:
                nonlocal title
                title += data
            if self._in_a:
                self._current_link_text.append(data.strip())

        def handle_endtag(self, tag: str):
            if tag == "title":
                self._in_title = False
            elif tag == "a" and self._in_a:
                self._in_a = False
                href = self._current_link_href
                text = " ".join(self._current_link_text).strip()
                if href and href not in seen_link_urls and len(links) < MAX_LINKS:
                    seen_link_urls.add(href)
                    links.append(NavLink(url=href, text=text or href))
                self._current_link_href = None
                self._current_link_text = []

    parser = Extractor()
    try:
        parser.feed(html)
    except Exception:
        pass

    return media, links, title.strip()


def _best_from_srcset(srcset: str) -> Optional[str]:
    """Pick the highest-resolution URL from a srcset attribute."""
    best_url = None
    best_size = 0
    for part in srcset.split(","):
        parts = part.strip().split()
        if not parts:
            continue
        url = parts[0]
        size = 1
        if len(parts) > 1:
            descriptor = parts[1]
            if descriptor.endswith("w"):
                size = int(descriptor[:-1]) if descriptor[:-1].isdigit() else 1
            elif descriptor.endswith("x"):
                try:
                    size = int(float(descriptor[:-1]) * 1000)
                except ValueError:
                    size = 1
        if size > best_size:
            best_size = size
            best_url = url
    return best_url


def _parse_int(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


@router.post("/url-browse", response_model=BrowseResult)
async def browse_url(
    principal: CurrentUser,
    url: str = Query(..., description="URL to fetch and extract media from"),
):
    """
    Fetch a URL and extract images, videos, and navigation links.

    Acts as a server-side proxy to avoid CORS issues. Returns structured
    media items and links for in-app browsing.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are supported")

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=REQUEST_TIMEOUT,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; PixSim7/1.0)",
                "Accept": "text/html,application/xhtml+xml,*/*",
            },
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type and "xhtml" not in content_type:
                # Not HTML — check if it's a direct media URL
                kind = _classify_url(url)
                if kind:
                    return BrowseResult(
                        url=str(response.url),
                        title="Direct media",
                        media=[MediaItem(url=str(response.url), kind=kind)],
                    )
                return BrowseResult(
                    url=str(response.url),
                    error=f"Not an HTML page (content-type: {content_type})",
                )

            if len(response.content) > MAX_RESPONSE_SIZE:
                return BrowseResult(
                    url=str(response.url),
                    error="Page too large (> 5MB)",
                )

            html = response.text
            base_url = str(response.url)
            media, links, title = _extract_media_and_links(html, base_url)

            logger.debug(
                "url_browse",
                url=url,
                media_count=len(media),
                link_count=len(links),
                title=title[:80] if title else None,
                domain="system",
            )

            return BrowseResult(
                url=base_url,
                title=title,
                media=media,
                links=links,
            )

    except httpx.HTTPStatusError as e:
        return BrowseResult(url=url, error=f"HTTP {e.response.status_code}")
    except httpx.RequestError as e:
        return BrowseResult(url=url, error=f"Request failed: {type(e).__name__}")
    except Exception as e:
        logger.warning("url_browse_error", url=url, error=str(e))
        return BrowseResult(url=url, error=str(e))
