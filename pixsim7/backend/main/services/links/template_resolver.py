"""Template→Runtime Resolution Utilities

Provides utility functions for resolving template entity references to runtime entities
via ObjectLink system. Used by interaction executors, scene runtime, and other systems
that need to work with template-based entity references.

Usage:
    # Resolve a template reference to runtime entity ID
    runtime_id = await resolve_template_to_runtime(
        db=db,
        template_kind='characterInstance',
        template_id='abc-123-uuid',
        context={'location': {'zone': 'downtown'}}
    )

    # Resolve interaction target references
    targets = await resolve_interaction_targets(
        db=db,
        definition=interaction_def,
        context=execution_context
    )
"""
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.links.link_service import LinkService


async def resolve_template_to_runtime(
    db: AsyncSession,
    template_kind: str,
    template_id: str,
    *,
    link_id: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    """
    Resolve a template entity reference to a runtime entity ID via ObjectLink.

    Delegates to LinkService.get_active_link_for_template() for canonical
    sync_enabled + activation + priority filtering.

    Args:
        db: Database session
        template_kind: Template entity kind (e.g., 'characterInstance', 'itemTemplate')
        template_id: Template entity ID (usually UUID)
        link_id: Optional explicit link ID to use
        context: Runtime context for activation-based resolution

    Returns:
        Runtime entity ID (int) or None if no active link found

    Example:
        # Resolve character instance to active NPC
        npc_id = await resolve_template_to_runtime(
            db, 'characterInstance', 'abc-123',
            context={'location': {'zone': 'downtown'}}
        )
    """
    link_service = LinkService(db)

    if link_id:
        # Use explicit link
        from uuid import UUID
        link = await link_service.get_link(UUID(link_id))
        if link and link.sync_enabled:
            return link.runtime_id
        return None

    # Delegate to LinkService for canonical filtering (sync_enabled + activation + priority)
    link = await link_service.get_active_link_for_template(
        template_kind,
        template_id,
        context
    )

    return link.runtime_id if link else None


async def resolve_interaction_targets(
    db: AsyncSession,
    definition: Any,  # NpcInteractionDefinition
    context: Optional[Dict[str, Any]] = None,
) -> List[int]:
    """
    Resolve interaction target references (both direct IDs and template refs) to runtime NPC IDs.

    This function handles backward compatibility:
    1. Checks targetTemplateKind/targetTemplateId first (new system)
    2. Falls back to targetRolesOrIds/targetNpcIds (existing system)

    Args:
        db: Database session
        definition: NpcInteractionDefinition with target specifications
        context: Runtime context for link resolution

    Returns:
        List of resolved NPC IDs

    Example:
        # Resolve targets from interaction definition
        npc_ids = await resolve_interaction_targets(
            db, interaction_def, {'location': {'zone': 'downtown'}}
        )
    """
    resolved_ids: List[int] = []

    # 1. Check for template-based targeting (new system)
    if hasattr(definition, 'targetTemplateKind') and definition.targetTemplateKind:
        template_kind = definition.targetTemplateKind
        template_id = getattr(definition, 'targetTemplateId', None)
        link_id = getattr(definition, 'targetLinkId', None)

        if template_id:
            runtime_id = await resolve_template_to_runtime(
                db,
                template_kind,
                template_id,
                link_id=link_id,
                context=context
            )
            if runtime_id:
                resolved_ids.append(runtime_id)

    # 2. Fall back to direct ID targeting (existing system)
    elif hasattr(definition, 'targetRolesOrIds') and definition.targetRolesOrIds:
        # Parse role/ID refs like "npc:123"
        for ref in definition.targetRolesOrIds:
            if ref.startswith('npc:'):
                try:
                    npc_id = int(ref.split(':')[1])
                    resolved_ids.append(npc_id)
                except (ValueError, IndexError):
                    pass

    # 3. Legacy targetNpcIds (deprecated)
    elif hasattr(definition, 'targetNpcIds') and definition.targetNpcIds:
        resolved_ids.extend(definition.targetNpcIds)

    return resolved_ids


async def resolve_scene_role_bindings(
    db: AsyncSession,
    node: Any,  # SceneTransitionNode
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    """
    Resolve scene role bindings from both template refs and direct IDs.

    Handles both:
    - roleBindings (direct NPC IDs) - existing system
    - templateRoleBindings (template refs) - new system

    Args:
        db: Database session
        node: SceneTransitionNode with role binding specifications
        context: Runtime context for link resolution

    Returns:
        Dict mapping role -> resolved NPC ID

    Example:
        # Resolve role bindings for scene transition
        bindings = await resolve_scene_role_bindings(
            db, scene_node, {'location': {'zone': 'downtown'}}
        )
        # bindings = {'protagonist': 42, 'antagonist': 43}
    """
    resolved_bindings: Dict[str, int] = {}

    # 1. Start with template-based bindings (new system)
    if hasattr(node, 'templateRoleBindings') and node.templateRoleBindings:
        for role, template_ref in node.templateRoleBindings.items():
            template_kind = template_ref.get('templateKind')
            template_id = template_ref.get('templateId')
            link_id = template_ref.get('linkId')

            if template_kind and template_id:
                runtime_id = await resolve_template_to_runtime(
                    db,
                    template_kind,
                    template_id,
                    link_id=link_id,
                    context=context
                )
                if runtime_id:
                    resolved_bindings[role] = runtime_id

    # 2. Merge with direct ID bindings (existing system, lower priority)
    if hasattr(node, 'roleBindings') and node.roleBindings:
        for role, npc_id in node.roleBindings.items():
            # Only use direct binding if not already resolved via template
            if role not in resolved_bindings:
                resolved_bindings[role] = npc_id

    return resolved_bindings


async def resolve_node_template_references(
    db: AsyncSession,
    node: Any,  # SceneContentNode or other node type
    context: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    """
    Resolve template references from a scene content node.

    Checks node.templateKind/templateId/linkId and resolves to runtime entity ID.

    Args:
        db: Database session
        node: Node with template reference fields
        context: Runtime context for link resolution

    Returns:
        Runtime entity ID (int) or None if no template refs or resolution failed

    Example:
        # Resolve template ref from scene node
        entity_id = await resolve_node_template_references(
            db, scene_node, context
        )
    """
    if not hasattr(node, 'templateKind') or not node.templateKind:
        return None

    template_kind = node.templateKind
    template_id = getattr(node, 'templateId', None)
    link_id = getattr(node, 'linkId', None)

    if not template_id:
        return None

    return await resolve_template_to_runtime(
        db,
        template_kind,
        template_id,
        link_id=link_id,
        context=context
    )
