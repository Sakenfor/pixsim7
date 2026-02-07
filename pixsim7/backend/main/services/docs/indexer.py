from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
import json
import re

import yaml

try:
    import mistune
    try:
        from mistune.plugins import plugin_table, plugin_task_lists, plugin_strikethrough
        _plugins = [plugin_table, plugin_task_lists, plugin_strikethrough]
    except Exception:
        _plugins = []
except Exception:
    mistune = None
    _plugins = []

from pixsim7.backend.main.shared.config import _resolve_repo_root
from pixsim_logging import get_logger

logger = get_logger()

DOCS_SOURCES_FILE = "docs/docs.sources.json"
DEFAULT_DOCS_ROOTS = [
    {"path": "docs", "origin": "core"},
]

_docs_cache: Optional[Dict[str, Any]] = None

if mistune:
    _markdown = mistune.create_markdown(
        renderer="ast",
        plugins=_plugins,
    )
else:
    _markdown = None


@dataclass
class DocsRoot:
    path: Path
    origin: str


@dataclass
class DocPage:
    path: str
    doc_id: str
    title: str
    summary: Optional[str]
    front_matter: Dict[str, Any]
    visibility: str
    ast: List[Dict[str, Any]]
    markdown: str
    links: List[Dict[str, Any]]
    backlinks: List[str]
    updated_at: str
    origin: str
    tags: List[str]
    feature_ids: List[str]
    search_text: str


def get_docs_index(refresh: bool = False) -> Dict[str, Any]:
    global _docs_cache
    if _docs_cache is not None and not refresh:
        return _docs_cache

    _docs_cache = build_docs_index()
    return _docs_cache


def build_docs_index() -> Dict[str, Any]:
    repo_root = _resolve_repo_root()
    roots = load_docs_sources(repo_root)

    pages: Dict[str, DocPage] = {}

    for root in roots:
        if not root.path.exists():
            logger.warning("docs_root_missing", path=str(root.path))
            continue

        for file_path in root.path.rglob("*.md"):
            if file_path.name.startswith("."):
                continue

            rel_path = normalize_repo_path(file_path, repo_root)
            if not rel_path:
                continue

            try:
                raw_text = file_path.read_text(encoding="utf-8")
            except Exception:
                logger.exception("docs_read_failed", path=str(file_path))
                continue

            front_matter, body = split_front_matter(raw_text)
            ast = parse_markdown_ast(body)
            title = front_matter.get("title") or extract_first_heading(ast)
            if not title:
                title = Path(rel_path).stem.replace("-", " ").title()

            summary = front_matter.get("summary") or extract_first_paragraph(ast)
            tags = list(front_matter.get("tags") or [])
            feature_ids = list(front_matter.get("featureIds") or [])
            visibility = front_matter.get("visibility") or "internal"

            links = collect_links(ast, rel_path, repo_root)

            updated_at = datetime.fromtimestamp(
                file_path.stat().st_mtime,
                tz=timezone.utc,
            ).isoformat()

            doc_id = front_matter.get("id") or rel_path.replace("/", ":").replace(".md", "")

            search_text = " ".join(
                part
                for part in [
                    title or "",
                    summary or "",
                    " ".join(tags),
                    extract_text(ast),
                ]
                if part
            ).lower()

            pages[rel_path] = DocPage(
                path=rel_path,
                doc_id=doc_id,
                title=title,
                summary=summary,
                front_matter=front_matter,
                visibility=visibility,
                ast=ast,
                markdown=body,
                links=links,
                backlinks=[],
                updated_at=updated_at,
                origin=root.origin,
                tags=tags,
                feature_ids=feature_ids,
                search_text=search_text,
            )

    backlinks_map: Dict[str, List[str]] = {path: [] for path in pages.keys()}

    for page in pages.values():
        for link in page.links:
            if link.get("kind") != "doc":
                continue
            target = link.get("resolvedPath")
            if target and target in backlinks_map:
                backlinks_map[target].append(page.path)

    for page in pages.values():
        page.backlinks = sorted(set(backlinks_map.get(page.path, [])))
        for link in page.links:
            if link.get("kind") == "doc" and link.get("resolvedPath") in pages:
                link["title"] = pages[link["resolvedPath"]].title

    entries = [
        {
            "id": page.doc_id,
            "path": page.path,
            "title": page.title,
            "summary": page.summary,
            "tags": page.tags,
            "featureIds": page.feature_ids,
            "visibility": page.visibility,
            "origin": page.origin,
            "links": page.links,
            "backlinks": page.backlinks,
            "updatedAt": page.updated_at,
        }
        for page in sorted(pages.values(), key=lambda p: p.path)
    ]

    return {
        "version": "1.0.0",
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "entries": entries,
        "pages": pages,
    }


def load_docs_sources(repo_root: Path) -> List[DocsRoot]:
    sources_path = None
    candidates = [
        repo_root / DOCS_SOURCES_FILE,
        Path.cwd() / DOCS_SOURCES_FILE,
        Path(DOCS_SOURCES_FILE),
    ]

    for candidate in candidates:
        if candidate.exists():
            sources_path = candidate
            break

    if sources_path is None:
        return [
            DocsRoot(path=repo_root / root["path"], origin=root.get("origin", "core"))
            for root in DEFAULT_DOCS_ROOTS
        ]

    try:
        data = json.loads(sources_path.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("docs_sources_parse_failed", path=str(sources_path))
        data = {"roots": DEFAULT_DOCS_ROOTS}

    roots: List[DocsRoot] = []
    for root in data.get("roots", []):
        root_path = root.get("path")
        if not root_path:
            continue
        resolved = resolve_root_path(Path(root_path), repo_root)
        roots.append(DocsRoot(path=resolved, origin=root.get("origin", "core")))

    if not roots:
        roots = [
            DocsRoot(path=repo_root / root["path"], origin=root.get("origin", "core"))
            for root in DEFAULT_DOCS_ROOTS
        ]

    return roots


def resolve_root_path(path: Path, repo_root: Path) -> Path:
    if path.is_absolute():
        return path

    candidate = repo_root / path
    if candidate.exists():
        return candidate

    return path


def split_front_matter(text: str) -> tuple[Dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not match:
        return {}, text

    raw = match.group(1)
    body = text[match.end() :]

    try:
        data = yaml.safe_load(raw) or {}
    except Exception:
        logger.exception("docs_front_matter_parse_failed")
        data = {}

    return data, body


def parse_markdown_ast(text: str) -> List[Dict[str, Any]]:
    if _markdown is None:
        logger.warning("docs_markdown_unavailable", reason="mistune_not_loaded")
        return []
    try:
        return _markdown(text)
    except Exception:
        logger.exception("docs_markdown_parse_failed")
        return []


def extract_first_heading(nodes: Iterable[Dict[str, Any]]) -> Optional[str]:
    for node in nodes:
        if node.get("type") == "heading":
            return extract_text(node.get("children", [])).strip()
    return None


def extract_first_paragraph(nodes: Iterable[Dict[str, Any]]) -> Optional[str]:
    for node in nodes:
        if node.get("type") == "paragraph":
            text = extract_text(node.get("children", [])).strip()
            if text:
                return text
    return None


def extract_text(nodes: Iterable[Dict[str, Any]]) -> str:
    parts: List[str] = []

    for node in nodes:
        node_type = node.get("type")
        if node_type in ("text", "codespan"):
            parts.append(node.get("text", ""))
        elif node_type in ("linebreak", "softbreak"):
            parts.append(" ")
        else:
            parts.append(extract_text(node.get("children", [])))

    return "".join(parts)


def collect_links(
    nodes: Iterable[Dict[str, Any]],
    doc_path: str,
    repo_root: Path,
) -> List[Dict[str, Any]]:
    links: List[Dict[str, Any]] = []

    def visit(node: Dict[str, Any]) -> None:
        node_type = node.get("type")
        if node_type == "link":
            href = node.get("link") or node.get("url")
            if href:
                link = resolve_link(href, doc_path, repo_root)
                if link:
                    links.append(link)
        elif node_type == "image":
            href = node.get("src")
            if href:
                link = resolve_link(href, doc_path, repo_root)
                if link:
                    links.append(link)

        for child in node.get("children", []) or []:
            visit(child)

    for node in nodes:
        visit(node)

    return links


def resolve_link(href: str, doc_path: str, repo_root: Path) -> Optional[Dict[str, Any]]:
    if not href:
        return None

    anchor = None
    raw_href = href

    if href.startswith("#"):
        anchor = href[1:] if len(href) > 1 else None
        return {
            "href": raw_href,
            "kind": "anchor",
            "resolvedPath": doc_path,
            "anchor": anchor,
        }

    if "#" in href:
        href, anchor = href.split("#", 1)

    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", href):
        return {
            "href": raw_href,
            "kind": "external",
        }

    if href.startswith("mailto:"):
        return {
            "href": raw_href,
            "kind": "external",
        }

    if href.startswith("/"):
        resolved = repo_root / href.lstrip("/")
    elif href.startswith("./") or href.startswith("../"):
        resolved = repo_root / Path(doc_path).parent / href
    else:
        resolved = repo_root / href

    resolved_path = normalize_repo_path(resolved, repo_root)

    kind = "external"
    if resolved_path.endswith(".md") or resolved_path.startswith("docs/"):
        kind = "doc"
    elif resolved_path.split("/")[0] in ("apps", "packages", "pixsim7", "services"):
        kind = "code"
    else:
        kind = "doc"

    payload: Dict[str, Any] = {
        "href": raw_href,
        "kind": kind,
        "resolvedPath": resolved_path,
    }

    if anchor:
        payload["anchor"] = anchor

    return payload


def normalize_repo_path(path: Path, repo_root: Path) -> str:
    try:
        return str(path.resolve().relative_to(repo_root)).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def search_docs(index: Dict[str, Any], query: str, limit: int = 50) -> List[Dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return []

    pages: Dict[str, DocPage] = index.get("pages", {})
    results = []
    for entry in index.get("entries", []):
        page = pages.get(entry["path"])
        if not page:
            continue
        if q in page.search_text:
            results.append(entry)
        if len(results) >= limit:
            break

    return results
