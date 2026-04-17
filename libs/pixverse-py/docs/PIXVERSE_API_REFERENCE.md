# Pixverse API Reference

**Extracted from PixSim3** - 2025-10-22

This document contains the real Pixverse API endpoints, request/response formats, and implementation details extracted from the working PixSim3 codebase.

---

## Base URLs

- **API Base**: `https://app-api.pixverse.ai`
- **App URL**: `https://app.pixverse.ai`
- **CDN**: `https://cdn.pixverse.ai`
- **Media**: `https://media.pixverse.ai`

---

## Authentication

### Headers for Web API (JWT)

```python
headers = {
    "token": jwt_token,
    "ai-trace-id": str(uuid.uuid4()),
    "ai-anonymous-id": str(uuid.uuid4()),
    "Content-Type": "application/json",
    "Origin": "https://app.pixverse.ai",
    "Referer": "https://app.pixverse.ai/",
    "x-platform": "Web",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "refresh": "credit"  # CRITICAL: Required for generation endpoints
}
```

**Important**: The `"refresh": "credit"` header is CRITICAL for generation endpoints. It tells Pixverse to allocate credits and process the video. Omit this header for delete operations.

### Headers for OpenAPI (API Key)

```python
headers = {
    "API-KEY": api_key,
    "Ai-trace-id": str(uuid.uuid4()),
    "Content-Type": "application/json"
}
```

### Session Validation (Fast-Path Refresh)

**Endpoint**: `GET /creative_platform/user/credits` or `/creative_platform/config/ad_credits`

Quick check to validate JWT token without browser:

```python
# Use _ai_token cookie value as JWT
response = session.get(
    "https://app-api.pixverse.ai/creative_platform/user/credits",
    headers={"token": jwt_token}
)
# If status_code == 200 and ErrCode == 0, session is valid
```

---

## Video Generation

### Web API (JWT) - Image-to-Video

**Endpoint**: `POST /creative_platform/video/i2v`

**Request Payload**:
```json
{
  "create_count": 1,
  "customer_img_path": "upload/uuid.jpg",
  "customer_img_url": "https://media.pixverse.ai/upload/uuid.jpg",
  "duration": 4,
  "lip_sync_tts_speaker_id": "Auto",
  "model": "v3.5",
  "prompt": "A serene mountain landscape",
  "quality": "1080p",
  "seed": 12345
}
```

**Field Details**:
- `create_count`: Always 1 (number of videos to generate)
- `customer_img_path`: OSS object key (e.g., "upload/uuid.jpg")
- `customer_img_url`: Full CDN URL to the image
- `duration`: 4 or 8 seconds
- `model`: "v3.5" or other model IDs
- `quality`: "1080p", "720p", etc.
- `seed`: Optional seed for reproducibility
- **For text-to-video**: Omit `customer_img_path` and `customer_img_url` entirely

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "video_ids": [123456789]
  }
}
```

### OpenAPI (API Key) - Image-to-Video

**Endpoint**: `POST /openapi/v2/video/img/generate`

**Request Payload**:
```json
{
  "prompt": "A serene mountain landscape",
  "img_id": 12345,
  "model": "v3.5",
  "quality": "1080p",
  "duration": 4,
  "motion_mode": "default",
  "negative_prompt": "",
  "seed": 0
}
```

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "video_id": "123456789",
    "id": "123456789",
    "task_id": "123456789"
  }
}
```

---

## Image Generation (i2i)

### Web API - Image-to-Image

**Endpoint**: `POST /creative_platform/image/i2i`

**Available Models**:
| Display Name | Model Value | Supported Qualities |
|--------------|-------------|---------------------|
| Nano Banana Pro | `gemini-3.0` | 1080p, 2K, 4K (default) |
| Nano Banana | `gemini-2.5-flash` | 1080p |
| Seedream 4.0 | `seedream-4.0` | 1080p, 2K, 4K |
| Qwen Image | `qwen-image` | 720p, 1080p (legacy) |

**Aspect Ratios** (all models): `16:9`, `4:3`, `1:1`, `3:4`, `9:16`

**Request Payload**:
```json
{
  "create_count": 1,
  "prompt": "Transform into anime style",
  "model": "gemini-3.0",
  "quality": "720p",
  "customer_img_paths": ["upload/source.jpg"],
  "customer_img_urls": ["https://media.pixverse.ai/upload/source.jpg"],
  "seed": 12345,
  "aspect_ratio": "9:16"
}
```

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "image_id": "98765",
    "success_ids": [98765]
  }
}
```

---

## Image Upload

### OSS Upload Flow (Web API)

This is the native web method using Alibaba Cloud OSS with STS tokens.

**Step 1**: Get Upload Token

**Endpoint**: `POST /creative_platform/getUploadToken`

**Request**: `{}`

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "Ak": "STS.xxx",
    "Sk": "xxx",
    "Token": "xxx"
  }
}
```

**Step 2**: Upload to OSS

```python
import oss2

auth = oss2.StsAuth(Ak, Sk, Token)
bucket = oss2.Bucket(auth, "https://oss-accelerate.aliyuncs.com", "pixverse-fe-upload")
object_key = f"upload/{uuid.uuid4()}.jpg"
bucket.put_object_from_file(object_key, "/path/to/image.jpg")
```

**Step 3**: Register Upload

**Endpoint**: `POST /creative_platform/media/batch_upload_media`

**Request Payload**:
```json
{
  "images": [
    {
      "name": "image.jpg",
      "size": 1234567,
      "path": "upload/uuid.jpg"
    }
  ]
}
```

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "result": [
      {
        "id": 12345,
        "url": "https://media.pixverse.ai/upload/uuid.jpg",
        "path": "upload/uuid.jpg",
        "size": 1234567,
        "err_msg": ""
      }
    ]
  }
}
```

### OpenAPI Upload (Fallback)

**Endpoint**: `POST /openapi/v2/image/upload`

**Request**: Multipart form data with `image` field

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "img_id": 12345,
    "id": 12345
  }
}
```

---

## Status Polling

### Web API - Message Check

**Endpoint**: `POST /creative_platform/account/message`

**Request Payload**:
```json
{
  "offset": 0,
  "limit": 50,
  "polling": true,
  "filter": {"off_peak": 0},
  "web_offset": 0,
  "app_offset": 0
}
```

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "video_list": [123456, 789012],
    "image_list": [345678]
  }
}
```

### Web API - Video Details

**Endpoint**: `POST /creative_platform/video/list/personal`

**Request Payload**:
```json
{
  "offset": 0,
  "limit": 100,
  "polling": true,
  "filter": {},
  "web_offset": 0,
  "app_offset": 0
}
```

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "data": [
      {
        "video_id": "123456",
        "status": 1,
        "video_url": "https://cdn.pixverse.ai/...",
        "first_frame": "https://cdn.pixverse.ai/...",
        "prompt": "Mountain landscape",
        "model": "v3.5"
      }
    ]
  }
}
```

### Web API - Image Details

**Endpoint**: `POST /creative_platform/image/list/personal`

Same payload structure as video list, returns image data.

### OpenAPI - Poll Result

**Endpoint**: `GET /openapi/v2/video/result?video_id={id}`

Alternative params: `?id={id}` or `?task_id={id}`

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "status": 1,
    "video_url": "https://cdn.pixverse.ai/...",
    "url": "https://cdn.pixverse.ai/...",
    "first_frame": "https://cdn.pixverse.ai/..."
  }
}
```

---

## Video Management

### Delete Videos

**Endpoint**: `POST /creative_platform/video/delete`

**Request Payload**:
```json
{
  "video_ids": [123456, 789012],
  "platform": "web"
}
```

**Important**: Do NOT include `"refresh": "credit"` header for delete operations.

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": ""
}
```

---

## Image Management

### Delete Images

**Endpoint**: `POST /creative_platform/image/delete`

**Request Payload**:
```json
{
  "image_ids": [379093339806854],
  "platform": "web"
}
```

**Important**: Do NOT include `"refresh": "credit"` header for delete operations.

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "Success",
  "Resp": null
}
```

---

## Status Codes

### Video/Image Status

- **0**: Initial/unknown
- **1**: Completed successfully
- **5**: Processing
- **7**: Filtered by content policy (retryable)
- **8**: Failed permanently (not retryable)
- **9**: Failed (variant of 8)
- **10**: Filtered (variant of 7)

### Error Codes

- **0**: Success
- **10005**: Session expired (logged in elsewhere)
- Other codes: Various API errors

---

## Error Response Format

All API responses follow this structure:

```json
{
  "ErrCode": 10005,
  "ErrMsg": "Session expired"
}
```

**Error Handling**:
```python
def check_error(response_data: dict) -> None:
    err_code = response_data.get("ErrCode", 0)
    if err_code != 0:
        err_msg = response_data.get("ErrMsg", "Unknown error")

        if err_code == 10005:
            raise AuthenticationError("Session expired (logged in elsewhere)")

        raise APIError(f"Pixverse API error {err_code}: {err_msg}")
```

---

## Google OAuth Flow

1. Navigate to `https://app.pixverse.ai/login`
2. Click "Login with Google" button
3. Handle Google OAuth popup/redirect
4. Fill Google credentials if needed
5. Wait for redirect back to Pixverse
6. Extract cookies, especially `_ai_token`
7. Use `_ai_token` value as JWT token

---

## Session Refresh Strategy

**Fast-path** (no browser needed):
1. Load existing cookies from file
2. Extract `_ai_token` cookie value
3. Test with API call to `/creative_platform/user/credits`
4. If successful, session is still valid
5. Use `_ai_token` as JWT token

**Fallback** (browser refresh):
1. Open browser with existing cookies
2. Navigate to `https://app.pixverse.ai/asset/video`
3. Wait for page load
4. Extract fresh cookies
5. Save updated cookies

---

## Credits API

### Get Credits

**Endpoint**: `GET /creative_platform/user/credits`

**Response**:
```json
{
  "ErrCode": 0,
  "ErrMsg": "",
  "Resp": {
    "credits": 1000,
    "free_credits": 100
  }
}
```

### Get Ad Credits Config

**Endpoint**: `GET /creative_platform/config/ad_credits`

Returns configuration for ad-based credit earning.

---

## Implementation Notes

### Critical Headers

1. **Always include** `"refresh": "credit"` for generation endpoints
2. **Never include** `"refresh": "credit"` for delete operations
3. **Always generate** new UUIDs for `ai-trace-id` and `ai-anonymous-id`

### Image Upload Best Practices

1. **Preferred**: OSS upload (faster, native web method)
   - Requires JWT token
   - Returns both path and URL
   - 3-step process (token → upload → register)

2. **Fallback**: OpenAPI upload
   - Requires API key
   - Returns img_id only
   - Single multipart POST

### Status Polling Strategy

**Web API**:
1. Check `/account/message` to see if video is ready
2. If video_id in list, fetch details from `/video/list/personal`
3. Parse status code to determine completion/failure

**OpenAPI**:
1. Poll `/openapi/v2/video/result?video_id={id}`
2. Try multiple param variants (video_id, id, task_id)
3. Parse status from response

### Retry Logic for Filtered Videos

When status is 7 or 10 (filtered):
1. Optionally delete video from Pixverse
2. Generate new video with same/modified prompt
3. Retry up to N times
4. Return final result

---

## Example: Complete Generation Flow

```python
# 1. Upload image (OSS)
token_resp = post("/creative_platform/getUploadToken", {})
sts = token_resp["Resp"]

# Upload to OSS...
object_key = upload_to_oss(image_path, sts)

# Register upload
register_resp = post("/creative_platform/media/batch_upload_media", {
    "images": [{"name": "img.jpg", "size": 123456, "path": object_key}]
})
image_url = register_resp["Resp"]["result"][0]["url"]

# 2. Generate video
gen_resp = post("/creative_platform/video/i2v", {
    "create_count": 1,
    "customer_img_path": object_key,
    "customer_img_url": image_url,
    "duration": 4,
    "model": "v3.5",
    "prompt": "Beautiful scenery",
    "quality": "1080p"
})
video_id = gen_resp["Resp"]["video_ids"][0]

# 3. Poll status
while True:
    time.sleep(5)

    # Check message list
    msg_resp = post("/creative_platform/account/message", {
        "offset": 0, "limit": 50, "polling": True,
        "filter": {"off_peak": 0}, "web_offset": 0, "app_offset": 0
    })

    if video_id not in msg_resp["Resp"]["video_list"]:
        continue  # Still processing

    # Get details
    list_resp = post("/creative_platform/video/list/personal", {
        "offset": 0, "limit": 100, "polling": True,
        "filter": {}, "web_offset": 0, "app_offset": 0
    })

    for video in list_resp["Resp"]["data"]:
        if video["video_id"] == video_id:
            if video["status"] == 1:
                print(f"Complete! {video['video_url']}")
                break
            elif video["status"] in [7, 10]:
                print("Filtered, retry needed")
                break
            elif video["status"] in [8, 9]:
                print("Failed permanently")
                break
```

---

## Dependencies

### Required
- `requests`: HTTP client
- `pydantic`: Data validation

### Optional
- `playwright`: Google OAuth, session refresh
- `oss2`: OSS upload (faster than OpenAPI)
- `pillow` + `imagehash`: Image hashing for deduplication

---

**Status**: Complete API reference extracted from PixSim3
**Next**: Update pixverse-py library with these real endpoints
