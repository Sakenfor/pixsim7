#!/bin/bash
# Quick script to run database migrations

cd "$(dirname "$0")/pixsim7/backend/main/infrastructure/database"
PYTHONPATH="$(dirname "$0")" alembic upgrade head
