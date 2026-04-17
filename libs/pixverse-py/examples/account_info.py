"""
Example: Get account information and credits

This example shows how to retrieve account details, credits,
and plan information from Pixverse.
"""

from pixverse import PixverseClient

# Initialize client
client = PixverseClient(
    email="your@email.com",
    session={
        "jwt_token": "eyJ...",  # Required for user info/credits
    }
)

# Example 1: Get user information
print("=== User Information ===")
user_info = client.get_user_info()

print(f"Real Email: {user_info.get('Mail')}")
print(f"Username: {user_info.get('Username')}")
print(f"Nickname: {user_info.get('Nickname')}")
print(f"Account ID: {user_info.get('AccId')}")
print(f"Premium Type: {user_info.get('PremiumType')}")
print(f"Has Password: {user_info.get('HasPassword')}")

# Example 2: Get credit balance
print("\n=== Credit Balance ===")
credits = client.get_credits()

print(f"Total Credits: {credits['total_credits']}")
print(f"  Daily: {credits['credit_daily']}")
print(f"  Monthly: {credits['credit_monthly']}")
print(f"  Package: {credits['credit_package']}")

# Example 3: Get plan details
print("\n=== Plan Details ===")
plan = client.get_plan_details()

print(f"Plan Name: {plan.get('plan_name')}")
print(f"Plan Type: {plan.get('current_plan_type')} (0=Basic, 1+=Premium)")
print(f"Daily Credits: {plan.get('credit_daily')}")
print(f"Daily Gift Credits: {plan.get('credit_daily_gift')}")
print(f"Available Qualities: {plan.get('qualities')}")
print(f"Batch Generation: {'Yes' if plan.get('batch_generation') else 'No'}")
print(f"Off-Peak Access: {'Yes' if plan.get('off_peak') else 'No'}")

# Example 4: Check if account can afford a generation
def can_afford_generation(credits_dict, quality="720p", duration=5):
    """Check if account has enough credits"""
    from pixverse import calculate_cost

    cost = calculate_cost(
        operation="text_to_video",
        quality=quality,
        duration=duration
    )

    total_available = credits_dict['total_credits']
    return total_available >= cost, total_available, cost

can_afford, available, needed = can_afford_generation(credits, "720p", 5)

print(f"\n=== Generation Affordability ===")
print(f"Available Credits: {available}")
print(f"Cost (720p, 5s): {needed}")
print(f"Can Afford: {'Yes' if can_afford else 'No'}")

# Example 5: OpenAPI credits (if available)
try:
    openapi_credits = client.get_openapi_credits()
    print(f"\n=== OpenAPI Credits ===")
    print(f"Total: {openapi_credits['total_credits']}")
    print(f"Monthly: {openapi_credits['credit_monthly']}")
    print(f"Package: {openapi_credits['credit_package']}")
except Exception as e:
    print(f"\nOpenAPI credits not available: {e}")
