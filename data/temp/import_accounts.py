#!/usr/bin/env python3
"""
Import provider accounts from pixsim6 to pixsim7
Only imports essential fields: provider_id, email, password, jwt_token, cookies, api_key
"""
import csv
import json
import psycopg2
from datetime import datetime

# Database connection strings
PIXSIM7_DB = "postgresql://pixsim:pixsim123@localhost:5434/pixsim7"
SAKENFOR_USER_ID = 1  # sakenfor's user_id in pixsim7

def import_accounts():
    """Import accounts from CSV into pixsim7"""
    conn = psycopg2.connect(PIXSIM7_DB)
    cur = conn.cursor()

    imported = 0
    skipped = 0
    errors = 0

    with open('G:/code/pixsim7/data/temp/accounts_export.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row in reader:
            provider_id = row['provider_id']
            email = row['email']

            try:
                # Check if account already exists
                cur.execute("""
                    SELECT id FROM provider_accounts
                    WHERE provider_id = %s AND email = %s AND user_id = %s
                """, (provider_id, email, SAKENFOR_USER_ID))

                if cur.fetchone():
                    print(f"SKIP: {email} (already exists)")
                    skipped += 1
                    continue

                # Parse cookies JSON
                cookies_str = row['cookies']
                try:
                    cookies = json.loads(cookies_str) if cookies_str and cookies_str != '{}' else None
                except:
                    cookies = None

                # Insert account with minimal fields
                cur.execute("""
                    INSERT INTO provider_accounts (
                        user_id,
                        is_private,
                        provider_id,
                        email,
                        password,
                        jwt_token,
                        api_key,
                        cookies,
                        nickname,
                        provider_user_id,
                        total_videos_generated,
                        total_videos_failed,
                        failure_streak,
                        status,
                        success_rate,
                        max_concurrent_jobs,
                        current_processing_jobs,
                        priority,
                        videos_today,
                        ema_alpha,
                        created_at,
                        updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        0, 0, 0, 'ACTIVE', 1.0, 1, 0, 5, 0, 0.1,
                        %s, %s
                    )
                """, (
                    SAKENFOR_USER_ID,
                    False,  # is_private
                    provider_id,
                    email,
                    row['password'] if row['password'] else None,
                    row['jwt_token'] if row['jwt_token'] else None,
                    row['api_key'] if row['api_key'] else None,
                    json.dumps(cookies) if cookies else None,
                    row['nickname'] if row['nickname'] else None,
                    row['provider_user_id'] if row['provider_user_id'] else None,
                    datetime.now(),
                    datetime.now()
                ))

                print(f"OK: Imported {email}")
                imported += 1

            except Exception as e:
                print(f"ERROR: {email}: {e}")
                errors += 1
                conn.rollback()
                continue

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nSummary:")
    print(f"  Imported: {imported}")
    print(f"  Skipped:  {skipped}")
    print(f"  Errors:   {errors}")
    print(f"  Total:    {imported + skipped + errors}")

if __name__ == "__main__":
    import_accounts()
