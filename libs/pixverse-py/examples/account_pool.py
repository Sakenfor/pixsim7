"""
Example: Multiple accounts with rotation
"""

from pixverse import PixverseClient, AccountPool

# Create account pool
pool = AccountPool(
    accounts=[
        {"email": "account1@gmail.com", "password": "password1"},
        {"email": "account2@gmail.com", "password": "password2"},
        {"email": "account3@gmail.com", "password": "password3"},
    ],
    strategy="round_robin"  # Options: round_robin, least_used, random, weighted
)

# Initialize client
client = PixverseClient(account_pool=pool)

# Generate multiple videos
prompts = [
    "a cat dancing",
    "a dog running",
    "a bird flying",
    "a fish swimming",
    "a horse galloping"
]

print(f"Generating {len(prompts)} videos with account rotation...")
print()

videos = []
for i, prompt in enumerate(prompts, 1):
    print(f"[{i}/{len(prompts)}] Generating: {prompt}")

    video = client.create(
        prompt=prompt,
        model="v5",
        duration=5
    )

    videos.append(video)
    print(f"  ✓ Created: {video.id}")

# Show pool statistics
print()
print("=" * 50)
print("Pool Statistics:")
print("=" * 50)

stats = client.get_pool_stats()
print(f"Total accounts: {stats['total_accounts']}")
print(f"Active accounts: {stats['active_accounts']}")
print(f"Total usage: {stats['total_usage']}")
print(f"Total failures: {stats['total_failures']}")
print(f"Success rate: {stats['success_rate']:.2%}")

# Show individual account stats
print()
print("Account Details:")
for i, account in enumerate(pool.accounts, 1):
    print(f"  {i}. {account.email}")
    print(f"     Usage: {account.usage_count}")
    print(f"     Failures: {account.failed_count}")
    print(f"     Active: {account.is_active}")
    print()
