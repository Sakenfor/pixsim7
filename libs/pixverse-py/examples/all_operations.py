"""
Example: All available operations
"""

from pixverse import PixverseClient

# Initialize client
client = PixverseClient(
    email="your.email@gmail.com",
    password="your_password"
)

# 1. Text-to-Video (defaults: model="v5", quality="360p")
print("1. Text-to-Video Generation")
video1 = client.create(
    prompt="a beautiful sunset over the ocean with waves crashing",
    duration=5
)
print(f"   ✓ Created: {video1.id}")
print()

# 2. Image-to-Video
print("2. Image-to-Video Generation")
video2 = client.image_to_video(
    image_url="https://example.com/beach.jpg",
    prompt="the waves start moving, sun setting slowly",
    duration=5
)
print(f"   ✓ Created: {video2.id}")
print()

# 3. Extend Video
print("3. Extend Existing Video")
extended = client.extend(
    video_url=video1.url,
    prompt="camera zooms out to reveal mountains in the background",
    duration=5
)
print(f"   ✓ Extended: {extended.id}")
print()

# 4. Transition
print("4. Create Transition Video")
transition = client.transition(
    image_urls=[
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
        "https://example.com/img3.jpg"
    ],
    prompts=[
        "smooth morph from beach to mountains",
        "gentle fade from mountains to forest"
    ],
    model="v5",
    durations="3,3"
)
print(f"   ✓ Transition created: {transition.id}")
print()

# 5. Get Video Status
print("5. Check Video Status")
status = client.get_video(video1.id)
print(f"   Status: {status.status}")
print(f"   URL: {status.url}")
print()

# 6. Wait for Completion
print("6. Wait for Video to Complete")
completed = client.wait_for_completion(video1, timeout=300)
print(f"   ✓ Completed: {completed.url}")
print(f"   Duration: {completed.duration}s")
