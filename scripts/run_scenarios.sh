#!/bin/bash
# Run scenario tests
#
# Usage:
#   ./scripts/run_scenarios.sh [options]
#
# Options are passed through to the scenario runner

set -e

# Set PYTHONPATH to project root
export PYTHONPATH="${PYTHONPATH:-.}"

# Run scenarios
python -m pixsim7_backend.scenarios "$@"
