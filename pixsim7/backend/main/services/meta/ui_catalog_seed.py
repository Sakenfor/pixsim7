"""
UI Catalog Seed Data

Hand-authored component entries, composition patterns, and agent guidance.
This is the canonical source of truth for the ``/api/v1/meta/ui/*`` endpoints.

Maintenance:
  - Add entries when a new shared component is created or an app-level API
    becomes agent-relevant (e.g. overlay widgets, generation stores).
  - CI validates that ``source_file`` paths and ``exports`` still exist.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pixsim7.backend.main.services.meta.ui_catalog_registry import (
    UIComponent,
    UIComponentExport,
    UIGuidance,
    UIPattern,
    UIPatternStep,
)

if TYPE_CHECKING:
    from pixsim7.backend.main.services.meta.ui_catalog_registry import UICatalogRegistry


# ═══════════════════════════════════════════════════════════════════════════
# Components
# ═══════════════════════════════════════════════════════════════════════════

_COMPONENTS: list[UIComponent] = [
    # ── Display ────────────────────────────────────────────────────────
    UIComponent(
        id="badge",
        name="Badge",
        category="display",
        source_file="packages/shared/ui/src/Badge.tsx",
        when_to_use="Small colored status label or pill.",
        use_instead_of="Inline <span> elements with bg-*/text-* color pill styling.",
        examples=['<Badge color="blue">Active</Badge>'],
        exports=[UIComponentExport("Badge", "component")],
        tags=["pill", "label", "status"],
    ),
    UIComponent(
        id="icon-badge",
        name="IconBadge",
        category="display",
        source_file="packages/shared/ui/src/Badge.tsx",
        when_to_use="Colored circle with an icon inside.",
        use_instead_of="Inline icon-in-colored-circle with manual bg/rounded-full styling.",
        exports=[UIComponentExport("IconBadge", "component")],
        tags=["icon", "badge", "circle"],
    ),
    UIComponent(
        id="icon",
        name="Icon",
        category="display",
        source_file="apps/main/src/lib/icons.tsx",
        when_to_use="Render any icon from the icon registry.",
        use_instead_of="Raw SVG imports or inline svg elements.",
        anti_patterns=[
            'className="text-white" alone won\'t work on colored backgrounds — use color="#fff" prop.',
        ],
        examples=['<Icon name="pin" size={16} />', '<Icon name="zap" size={10} color="#fff" />'],
        exports=[
            UIComponentExport("Icon", "component"),
            UIComponentExport("IconName", "type"),
        ],
        tags=["icon", "svg"],
    ),
    UIComponent(
        id="empty-state",
        name="EmptyState",
        category="display",
        source_file="packages/shared/ui/src/EmptyState.tsx",
        when_to_use="Empty list/panel placeholder with icon + message.",
        use_instead_of='Inline "No items" text or custom empty div.',
        exports=[UIComponentExport("EmptyState", "component")],
        tags=["empty", "placeholder"],
    ),
    UIComponent(
        id="tooltip",
        name="Tooltip",
        category="display",
        source_file="packages/shared/ui/src/Tooltip.tsx",
        when_to_use="Hover tooltip on any element.",
        use_instead_of="HTML title attribute or custom hover div.",
        exports=[UIComponentExport("Tooltip", "component")],
        tags=["tooltip", "hover"],
    ),
    UIComponent(
        id="loading-spinner",
        name="LoadingSpinner",
        category="display",
        source_file="packages/shared/ui/src/LoadingSpinner.tsx",
        when_to_use="Loading/spinner indicator.",
        use_instead_of="Custom CSS spinner or inline animate-spin div.",
        exports=[UIComponentExport("LoadingSpinner", "component")],
        tags=["loading", "spinner"],
    ),
    UIComponent(
        id="section-header",
        name="SectionHeader",
        category="display",
        source_file="packages/shared/ui/src/SectionHeader.tsx",
        when_to_use="Section label with optional action slot.",
        use_instead_of="Ad-hoc <h3>/<div> section labels.",
        exports=[UIComponentExport("SectionHeader", "component")],
        tags=["header", "section", "label"],
    ),

    # ── Input ──────────────────────────────────────────────────────────
    UIComponent(
        id="button",
        name="Button",
        category="input",
        source_file="packages/shared/ui/src/Button.tsx",
        when_to_use="Primary action button with variant/size system.",
        use_instead_of="Raw <button> with manual Tailwind classes.",
        exports=[
            UIComponentExport("Button", "component"),
            UIComponentExport("ButtonGroup", "component"),
        ],
        tags=["button", "action", "cta"],
    ),
    UIComponent(
        id="search-input",
        name="SearchInput",
        category="input",
        source_file="packages/shared/ui/src/SearchInput.tsx",
        when_to_use="Search/filter text field with icon and clear button.",
        use_instead_of="Raw <input> with search icon.",
        exports=[UIComponentExport("SearchInput", "component")],
        tags=["search", "filter", "input"],
    ),
    UIComponent(
        id="checkbox",
        name="Checkbox",
        category="input",
        source_file="packages/shared/ui/src/Checkbox.tsx",
        when_to_use="Labeled checkbox.",
        use_instead_of='Raw <input type="checkbox">.',
        exports=[UIComponentExport("Checkbox", "component")],
        tags=["checkbox", "toggle", "form"],
    ),
    UIComponent(
        id="select",
        name="Select",
        category="input",
        source_file="packages/shared/ui/src/Select.tsx",
        when_to_use="Dropdown select with consistent styling.",
        use_instead_of="Raw <select> or custom dropdown.",
        exports=[UIComponentExport("Select", "component")],
        tags=["select", "dropdown", "form"],
    ),
    UIComponent(
        id="filter-pill-group",
        name="FilterPillGroup",
        category="input",
        source_file="packages/shared/ui/src/FilterPillGroup.tsx",
        when_to_use="Horizontal filter pill bar (single or multi-select).",
        use_instead_of="Custom pill bar with manual active-state logic.",
        exports=[UIComponentExport("FilterPillGroup", "component")],
        tags=["filter", "pills", "tabs"],
    ),

    # ── Layout ─────────────────────────────────────────────────────────
    UIComponent(
        id="sidebar-content-layout",
        name="SidebarContentLayout",
        category="layout",
        source_file="packages/shared/ui/src/SidebarContentLayout.tsx",
        when_to_use="Two-pane sidebar + content split.",
        use_instead_of="Manual flexbox sidebar layouts.",
        exports=[UIComponentExport("SidebarContentLayout", "component")],
        tags=["sidebar", "layout", "split"],
    ),
    UIComponent(
        id="sidebar-pane-shell",
        name="SidebarPaneShell",
        category="layout",
        source_file="packages/shared/ui/src/SidebarPaneShell.tsx",
        when_to_use="Wrapper for sidebar panel content (title, scroll area, auto-hide title).",
        use_instead_of="Custom sidebar wrapper div with manual scroll handling.",
        exports=[UIComponentExport("SidebarPaneShell", "component")],
        tags=["sidebar", "pane", "shell"],
    ),
    UIComponent(
        id="modal",
        name="Modal",
        category="layout",
        source_file="packages/shared/ui/src/Modal.tsx",
        when_to_use="Modal dialog with backdrop.",
        use_instead_of="Custom portal + overlay div.",
        exports=[
            UIComponentExport("Modal", "component"),
            UIComponentExport("ConfirmModal", "component"),
        ],
        tags=["modal", "dialog", "overlay"],
    ),
    UIComponent(
        id="tabs",
        name="Tabs",
        category="navigation",
        source_file="packages/shared/ui/src/Tabs.tsx",
        when_to_use="Tab navigation with panels.",
        use_instead_of="Custom tab state + conditional rendering.",
        exports=[UIComponentExport("Tabs", "component")],
        tags=["tabs", "navigation"],
    ),
    UIComponent(
        id="hierarchical-sidebar-nav",
        name="HierarchicalSidebarNav",
        category="navigation",
        source_file="packages/shared/ui/src/HierarchicalSidebarNav.tsx",
        when_to_use="Tree-structured sidebar navigation with collapsible groups.",
        use_instead_of="Custom recursive tree rendering.",
        exports=[UIComponentExport("HierarchicalSidebarNav", "component")],
        tags=["tree", "sidebar", "navigation", "hierarchy"],
    ),

    # ── Overlay / Widget system ────────────────────────────────────────
    UIComponent(
        id="create-badge-widget",
        name="createBadgeWidget",
        category="overlay",
        source_file="apps/main/src/lib/ui/overlay/widgets/BadgeWidget.tsx",
        when_to_use=(
            "Create a badge overlay widget (icon, text, or icon-text pill) "
            "for OverlayContainer-based cards."
        ),
        use_instead_of="Inline JSX badges inside asset cards or overlay containers.",
        anti_patterns=[
            "Don't render badge JSX directly inside a card — use widget system for positioning/stacking.",
            "Don't hardcode pixel positions — use BADGE_SLOT presets.",
        ],
        examples=[
            'createBadgeWidget({ id: "skip", ...BADGE_SLOT.topRight, variant: "icon", icon: "eyeOff", '
            'color: "gray", shape: "circle", tooltip: "Skip", onClick: onToggle, '
            'priority: BADGE_PRIORITY.important })',
        ],
        exports=[
            UIComponentExport("createBadgeWidget", "utility", "(options: BadgeWidgetOptions) => OverlayWidget"),
            UIComponentExport("BADGE_SLOT", "constant", "{ topLeft, topRight, bottomLeft, bottomRight }"),
            UIComponentExport("BADGE_PRIORITY", "constant", "{ background, info, status, interactive, slotIndex, important, action, generation }"),
        ],
        tags=["badge", "widget", "overlay", "card"],
    ),
    UIComponent(
        id="widget-presets",
        name="widgetPresets",
        category="overlay",
        source_file="apps/main/src/lib/ui/overlay/widgetPresets.ts",
        when_to_use="Pre-built widget builders for common badge types (remove, pin, count, set-indicator).",
        use_instead_of="Building remove/pin/count badges from scratch with createBadgeWidget.",
        examples=[
            'buildRemoveWidget(onRemove, { id: "remove-asset", tooltip: "Remove", '
            'visibility: { trigger: "always" } })',
            "buildPinToggleWidget(isPinned, onToggle)",
            "buildCountBadgeWidget(count)",
        ],
        exports=[
            UIComponentExport("buildRemoveWidget", "utility", "(onRemove, options?) => OverlayWidget"),
            UIComponentExport("buildPinToggleWidget", "utility", "(isPinned, onToggle) => OverlayWidget"),
            UIComponentExport("buildCountBadgeWidget", "utility", "(count, options?) => OverlayWidget | null"),
            UIComponentExport("buildSetIndicatorWidget", "utility", "(options?) => OverlayWidget"),
            UIComponentExport("buildAddToSetWidget", "utility", "(onAdd, options?) => OverlayWidget"),
        ],
        tags=["widget", "preset", "remove", "pin", "badge"],
    ),
    UIComponent(
        id="compact-asset-card-widgets",
        name="buildCompactAssetCardLocalWidgets",
        category="overlay",
        source_file="apps/main/src/components/media/assetCardLocalWidgets.tsx",
        when_to_use=(
            "Build the standard widget set for CompactAssetCard: remove, skip, "
            "local-only indicator, locked-frame badge, generate button."
        ),
        use_instead_of="Adding ad-hoc widgets directly in CompactAssetCard consumers.",
        anti_patterns=[
            "Don't add widgets in AssetPanel/AssetPanelGrid directly — extend CompactAssetCardLocalWidgetsOptions.",
        ],
        exports=[
            UIComponentExport(
                "buildCompactAssetCardLocalWidgets",
                "utility",
                "(options: CompactAssetCardLocalWidgetsOptions) => OverlayWidget[]",
            ),
        ],
        tags=["asset-card", "widget", "generation"],
    ),
]


# ═══════════════════════════════════════════════════════════════════════════
# Patterns
# ═══════════════════════════════════════════════════════════════════════════

_PATTERNS: list[UIPattern] = [
    UIPattern(
        id="overlay-widget-badge",
        name="Add a badge to an asset card",
        description=(
            "How to add an interactive badge (skip, pin, status, etc.) to a "
            "CompactAssetCard using the overlay widget system."
        ),
        components=["create-badge-widget", "widget-presets", "compact-asset-card-widgets"],
        guidance=(
            "All card badges use the OverlayWidget system — never render "
            "badge JSX directly. Use BADGE_SLOT for anchor-based positioning "
            "and BADGE_PRIORITY for z-ordering. Preset builders "
            "(buildRemoveWidget, etc.) cover common cases. For new badge "
            "types, add to CompactAssetCardLocalWidgetsOptions and wire "
            "through CompactAssetCard props."
        ),
        recipe=[
            UIPatternStep(
                step=1,
                description="Add state field to InputItem or relevant store",
                code='skipped?: boolean; // in generationInputStore.ts InputItem',
            ),
            UIPatternStep(
                step=2,
                description="Add toggle action to the store",
                code='toggleSkip: (operationType, inputId) => { set(state => ({ ... })); }',
            ),
            UIPatternStep(
                step=3,
                description="Add option to CompactAssetCardLocalWidgetsOptions and build the widget",
                code=(
                    'if (onToggleSkip) {\n'
                    '  widgets.push(createBadgeWidget({\n'
                    '    id: "skip-toggle",\n'
                    '    ...BADGE_SLOT.topRight,\n'
                    '    visibility: { trigger: skipped ? "always" : "hover-container" },\n'
                    '    variant: "icon", icon: "eyeOff", shape: "circle",\n'
                    '    onClick: onToggleSkip,\n'
                    '    priority: BADGE_PRIORITY.important,\n'
                    '  }));\n'
                    '}'
                ),
            ),
            UIPatternStep(
                step=4,
                description="Add props to CompactAssetCard and wire to buildCompactAssetCardLocalWidgets",
                code=(
                    '// In CompactAssetCardProps:\n'
                    'skipped?: boolean;\n'
                    'onToggleSkip?: () => void;\n'
                    '// In cardWidgets useMemo: pass skipped, onToggleSkip'
                ),
            ),
            UIPatternStep(
                step=5,
                description="Wire through consumer (AssetPanel, AssetPanelGrid, etc.)",
                code=(
                    'skipped={item.skipped}\n'
                    'onToggleSkip={() => toggleSkip(operationType, item.id)}'
                ),
            ),
        ],
        source_files=[
            "apps/main/src/lib/ui/overlay/widgets/BadgeWidget.tsx",
            "apps/main/src/lib/ui/overlay/widgetPresets.ts",
            "apps/main/src/components/media/assetCardLocalWidgets.tsx",
            "apps/main/src/features/assets/components/shared/CompactAssetCard.tsx",
        ],
        tags=["badge", "widget", "asset-card", "overlay"],
    ),
    UIPattern(
        id="sidebar-navigation",
        name="Sidebar navigation panel",
        description="Two-pane layout with collapsible sidebar nav and main content area.",
        components=["sidebar-content-layout", "hierarchical-sidebar-nav", "search-input"],
        guidance=(
            "Use SidebarContentLayout for the split. HierarchicalSidebarNav "
            "for tree nav. useSidebarNav hook (with storageKey) for automatic "
            "persistence of expanded/selected state."
        ),
        recipe=[
            UIPatternStep(step=1, description="Wrap in SidebarContentLayout"),
            UIPatternStep(step=2, description="Left pane: HierarchicalSidebarNav + SearchInput"),
            UIPatternStep(step=3, description="Right pane: content switching on selected nav item"),
        ],
        source_files=["packages/shared/ui/src/SidebarContentLayout.tsx"],
        tags=["sidebar", "navigation", "layout"],
    ),
    UIPattern(
        id="filterable-list",
        name="Filterable list with badges",
        description="List with filter pills, search, and badge annotations.",
        components=["filter-pill-group", "badge", "empty-state", "search-input"],
        guidance=(
            "FilterPillGroup for category tabs, SearchInput for text filter, "
            "Badge for status annotations. Always show EmptyState when "
            "filtered results are empty."
        ),
        recipe=[
            UIPatternStep(step=1, description="SearchInput at top for text filtering"),
            UIPatternStep(step=2, description="FilterPillGroup below for category selection"),
            UIPatternStep(step=3, description="List body with Badge annotations per item"),
            UIPatternStep(step=4, description="EmptyState when no results match"),
        ],
        source_files=["packages/shared/ui/src/FilterPillGroup.tsx"],
        tags=["filter", "list", "search"],
    ),
]


# ═══════════════════════════════════════════════════════════════════════════
# Guidance
# ═══════════════════════════════════════════════════════════════════════════

_GUIDANCE = UIGuidance(
    rules=[
        "Before writing any inline UI element, check the catalog for an existing shared component.",
        'If a component has a "use_instead_of" field, NEVER use the described ad-hoc pattern.',
        "Use composition patterns for multi-component layouts.",
        'Import from "@pixsim7/shared.ui" for shared components. '
        'Import from "@lib/ui/overlay" for overlay widget APIs.',
    ],
    checklist_before_coding=[
        "Search input needed? → SearchInput (not raw <input>)",
        "Empty list state? → EmptyState (not inline 'No items' text)",
        "Section label? → SectionHeader (not ad-hoc <h3>/<div>)",
        "Small colored label? → Badge (not inline <span> with color classes)",
        "Checkbox? → Checkbox (not raw <input type='checkbox'>)",
        "Filter pills/tabs? → FilterPillGroup (not custom pill bar)",
        "Sidebar + content layout? → SidebarContentLayout + useSidebarNav",
        "Tooltip? → Tooltip (not title attribute or custom hover div)",
        "Card badge/indicator? → createBadgeWidget + BADGE_SLOT (not inline JSX)",
        "Remove button on card? → buildRemoveWidget (not custom X button)",
    ],
)


# ═══════════════════════════════════════════════════════════════════════════
# Seed function
# ═══════════════════════════════════════════════════════════════════════════


def seed_ui_catalog(registry: UICatalogRegistry) -> None:
    """Populate the registry with initial component, pattern, and guidance data."""
    for component in _COMPONENTS:
        registry.register(component.id, component)

    for pattern in _PATTERNS:
        registry.register_pattern(pattern)

    registry.set_guidance(_GUIDANCE)
