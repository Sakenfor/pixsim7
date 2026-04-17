"""
Example: Upload media files to Pixverse

This example shows how to upload image/video files to Pixverse
and use them in video generation requests.

Note: Upload requires OpenAPI key (paid tier)
"""

from pixverse import PixverseClient

# Initialize client with OpenAPI key
client = PixverseClient(
    email="your@email.com",
    session={
        "openapi_key": "px_...",  # Required for upload
        "use_method": "open-api"
    }
)

# Example 1: Upload image and use for image-to-video
print("Uploading image...")
upload_result = client.upload_media("/path/to/your/image.jpg")

print(f"Upload successful!")
print(f"  Media ID: {upload_result['id']}")
if 'url' in upload_result:
    print(f"  URL: {upload_result['url']}")

# Use the uploaded image for generation
print("\nGenerating video from uploaded image...")
video = client.create(
    prompt="the scene comes alive, gentle movement",
    image_url=f"img_id:{upload_result['id']}",  # Reference uploaded image
    quality="720p",
    duration=5
)

print(f"Video generation started: {video.id}")

# Example 2: Upload and use URL directly
upload_result2 = client.upload_media("/path/to/another/image.jpg")

# If the API returns a URL, you can use it directly too
if 'url' in upload_result2:
    video2 = client.create(
        prompt="camera pans across the landscape",
        image_url=upload_result2['url'],  # Use URL instead of img_id
        quality="720p",
        duration=5
    )
    print(f"Second video started: {video2.id}")

# Example 3: Upload multiple images for character/background consistency
subject_img = client.upload_media("/path/to/character.jpg")
background_img = client.upload_media("/path/to/background.jpg")

# Use in fusion (character consistency)
fusion_video = client.fusion(
    prompt="@character walks through @room",
    image_references=[
        {
            "type": "subject",
            "img_id": int(subject_img['id']),
            "ref_name": "character"
        },
        {
            "type": "background",
            "img_id": int(background_img['id']),
            "ref_name": "room"
        }
    ],
    quality="720p",
    duration=5
)

print(f"Fusion video started: {fusion_video.id}")

# Wait for completion
print("\nWaiting for videos to complete...")
completed = client.wait_for_completion(video, timeout=300)
print(f"Video ready: {completed.url}")
