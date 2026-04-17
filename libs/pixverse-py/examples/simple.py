"""
Simple example: Single account usage
"""

from pixverse import PixverseClient

# Initialize client
client = PixverseClient(
    email="your.email@gmail.com",
    password="your_password"
)

# Generate video (defaults: model="v5", quality="360p")
print("Generating video...")
video = client.create(
    prompt="a cat dancing in the rain",
    duration=5
)

print(f"Video created: {video.id}")
print(f"Status: {video.status}")

# Wait for completion
print("Waiting for completion...")
completed = client.wait_for_completion(video, timeout=300)

print(f"✓ Video completed!")
print(f"URL: {completed.url}")
print(f"Duration: {completed.duration}s")
