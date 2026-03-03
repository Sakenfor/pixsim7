from __future__ import annotations

import argparse
import asyncio
import os

from .seed_data import DEMO_PROJECT_NAME, DEMO_WORLD_NAME


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Seed a Bananza Boat gameplay slice (world, NPCs, locations, primitives, templates). "
            "Project snapshot bundles always come from the canonical project export contract."
        )
    )
    parser.add_argument(
        "--mode",
        choices=["api", "direct"],
        default="api",
        help=(
            "Seeder mode. "
            "'api' uses HTTP endpoints (recommended). "
            "'direct' writes world rows directly, but snapshot bundles still use export format."
        ),
    )
    parser.add_argument(
        "--owner-user-id",
        type=int,
        default=1,
        help="Owner user id for direct mode only (default: 1). Ignored in API mode.",
    )
    parser.add_argument(
        "--world-name",
        type=str,
        default=DEMO_WORLD_NAME,
        help=f"World name to create or reuse (default: {DEMO_WORLD_NAME!r}).",
    )
    parser.add_argument(
        "--project-name",
        type=str,
        default=DEMO_PROJECT_NAME,
        help=f"Saved project snapshot name to create or update (default: {DEMO_PROJECT_NAME!r}).",
    )
    parser.add_argument(
        "--project-id",
        type=int,
        default=None,
        help="Existing project snapshot id to overwrite directly (default: auto-detect by name).",
    )
    parser.add_argument(
        "--api-base",
        type=str,
        default=os.getenv("PIXSIM_API_BASE", "http://localhost:8000"),
        help="API base URL for API mode (default: env PIXSIM_API_BASE or http://localhost:8000).",
    )
    parser.add_argument(
        "--auth-token",
        type=str,
        default=None,
        help="Bearer token for API mode (default: env PIXSIM_AUTH_TOKEN or login).",
    )
    parser.add_argument(
        "--username",
        type=str,
        default=os.getenv("PIXSIM_USERNAME", "admin"),
        help="Login username for API mode when token is not provided (default: admin).",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=os.getenv("PIXSIM_PASSWORD", "admin"),
        help="Login password for API mode when token is not provided (default: admin).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    world_name = str(args.world_name).strip() or DEMO_WORLD_NAME
    project_name = str(args.project_name).strip() or DEMO_PROJECT_NAME
    project_id = int(args.project_id) if args.project_id is not None else None

    if str(args.mode) == "direct":
        from .flows.direct_flow import seed_bananza_boat_slice

        asyncio.run(
            seed_bananza_boat_slice(
                owner_user_id=int(args.owner_user_id),
                world_name=world_name,
                project_name=project_name,
                project_id=project_id,
            )
        )
        return

    if int(args.owner_user_id) != 1:
        print("note: --owner-user-id is ignored in API mode.")

    from .flows.api_flow import seed_bananza_boat_slice_via_api

    asyncio.run(
        seed_bananza_boat_slice_via_api(
            world_name=world_name,
            project_name=project_name,
            project_id=project_id,
            api_base=str(args.api_base).strip(),
            auth_token=(str(args.auth_token).strip() if args.auth_token is not None else None),
            username=str(args.username).strip() or "admin",
            password=str(args.password).strip() or "admin",
        )
    )


if __name__ == "__main__":
    main()
