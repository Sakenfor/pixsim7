"""User-facing agent system-prompt construction."""
from __future__ import annotations

from typing import List, Optional



from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
)


def build_user_system_prompt(
    focus: Optional[List[str]] = None,
    include_agent_workflow: bool = True,
) -> str:
    """Build a system prompt for the user-facing AI assistant.

    Args:
        focus: Optional list of capability tags (from the contract's ``provides``
               list, e.g. ``["asset_browsing", "generation_assistance"]``).
               When set, only endpoints tagged with at least one of these
               capabilities are included; this steers the agent toward the
               relevant tools without dumping the full endpoint catalog.
               When ``None``, all endpoints are included.
        include_agent_workflow: When ``True`` (default), append the
               dev/coding-agent workflow bullets (foreground-poll, tab
               branding, plan claiming). User-facing chat surfaces — whose
               focus vocabulary is purely asset/generation/game/prompt and
               which can't act on Bash/plans tools — pass ``False`` to drop
               this noise.

    The function walks the ``relates_to`` graph from ``user.assistant`` so
    that related contracts (e.g. ``game.authoring``) contribute their
    sub-endpoints when a matching focus tag is active.
    """
    contract = meta_contract_registry.get_or_none("user.assistant")

    lines = [
        "You are an AI assistant for the PixSim application.",
        "You help users with their assets, generations, game worlds, and prompts.",
        "",
        "You have MCP tools available that let you query and interact with the PixSim API.",
        "Use these tools to answer questions with real data — do not guess or say you lack access.",
        "",
    ]

    if contract and contract.provides:
        active_caps = focus if focus else contract.provides
        lines.append(f"Your capabilities: {', '.join(active_caps)}")
        lines.append("")

    # Collect endpoints.
    # - No focus: show only user.assistant's own endpoints (if any).
    # - Focus active: walk relates_to. For each related contract whose
    #   ``provides`` intersects the focus set:
    #     * Parent focus (no colon) matches a contract → include ALL its endpoints.
    #     * Sub-focus (has colon) matches → include only endpoints tagged with it.
    focus_set = set(focus) if focus else None
    collected: list = []

    # Own endpoints (tag-filtered when focus active)
    if contract and contract.sub_endpoints:
        for ep in contract.sub_endpoints:
            if focus_set is None or (ep.tags and focus_set.intersection(ep.tags)):
                collected.append(ep)

    # Related contract endpoints
    if focus_set and contract:
        for related_id in contract.relates_to:
            related = meta_contract_registry.get_or_none(related_id)
            if not related or not related.sub_endpoints:
                continue
            matched = focus_set.intersection(related.provides)
            if not matched:
                continue
            # If any matched focus is a parent tag (no colon), include all
            # endpoints from this contract. Otherwise filter by sub-focus tags.
            has_parent_match = any(":" not in f for f in matched)
            if has_parent_match:
                collected.extend(related.sub_endpoints)
            else:
                for ep in related.sub_endpoints:
                    if ep.tags and matched.intersection(ep.tags):
                        collected.append(ep)

    if collected:
        lines.append("Reference — relevant API endpoints:")
        for ep in collected:
            lines.append(f"  {ep.method} {ep.path} — {ep.summary}")
        lines.append("")

    lines.extend([
        "Guidelines:",
        "- Use tools to fetch live data for status/counts/lists; don't guess.",
        "- Use tools to create or modify, then confirm. Always confirm before destructive changes.",
        "- If a tool call fails, report the error clearly.",
        "- Be concise and helpful.",
    ])

    if include_agent_workflow:
        lines.extend([
            "- If you start a command/test/build whose outcome you intend to report (e.g. \"I'll run the tests and tell you the result\"), keep your turn OPEN and wait for it within this turn — run it in the foreground, or if backgrounded, poll BashOutput in a loop until it finishes, then report. Do NOT end your turn promising an async follow-up: nothing re-invokes you when a background task later completes, so that report would never reach the user. Only fire-and-forget a background task when you genuinely will not report on it.",
            "- Brand THIS chat tab at the start of substantive work: call set_tab_identity with an @lib/icons name and a short subtitle (e.g. icon='wrench', subtitle='refactoring auth'). It's idempotent — re-call as the focus shifts. Don't skip it; without an icon the tab is indistinguishable from every other one in the sidebar.",
            "- When working on a dev plan, claim it via plans.claim (with checkpoint_id when known) so the roster reflects who's where. For plan-bound tabs, mutating endpoints (plans.update/progress) auto-claim too — but an explicit claim returns a structured {icon, subtitle} suggestion you can pass straight to set_tab_identity.",
        ])

    return "\n".join(lines)
