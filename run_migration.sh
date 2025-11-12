#!/bin/bash
# Quick script to run database migrations

cd "$(dirname "$0")/pixsim7_backend/infrastructure/database"
PYTHONPATH="$(dirname "$0")" alembic upgrade head
