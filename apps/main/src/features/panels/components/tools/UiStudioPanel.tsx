/**
 * UI Studio Panel
 *
 * Unified workspace for:
 * - Surface inspection (Surface Workbench)
 * - HUD composition authoring (HUD Designer)
 * - Panel-group preset application (Panel Groups Workbench)
 */

import {
  PanelShell,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
} from "@pixsim7/shared.ui";
import clsx from "clsx";
import { useCallback, useMemo } from "react";

import { Icon, type IconName } from "@lib/icons";

import {
  CAP_UI_STUDIO_ACTIONS,
  CAP_UI_STUDIO_TARGET,
  useAuthoringContext,
  useProvideCapability,
  type UiStudioActionsContext,
  type UiStudioTabId,
  type UiStudioTargetContext,
} from "@features/contextHub";

import { OverlayConfig } from "@/routes/OverlayConfig";

import { HudDesignerPanel } from "../HudDesignerPanel";

import { SurfaceWorkbenchPanel } from "./SurfaceWorkbenchPanel";

interface UiStudioTab {
  id: UiStudioTabId;
  label: string;
  description: string;
  icon: IconName;
}

type UiStudioSectionId = "authoring";

const STUDIO_TAB_META: Record<UiStudioTabId, UiStudioTab> = {
  surfaces: {
    id: "surfaces",
    label: "Surfaces",
    description: "Inspect HUD/overlay/panel surface availability",
    icon: "layoutGrid",
  },
  hud: {
    id: "hud",
    label: "HUD Designer",
    description: "Author HUD region layouts with widgets",
    icon: "layout",
  },
  overlay: {
    id: "overlay",
    label: "Overlay",
    description: "Edit overlay widget layouts, stack groups, and runtime imports",
    icon: "layers",
  },
};

const STUDIO_TAB_IDS = Object.keys(STUDIO_TAB_META) as UiStudioTabId[];
const STUDIO_TAB_ID_SET = new Set<UiStudioTabId>(STUDIO_TAB_IDS);

const STUDIO_SECTION_TABS: Record<UiStudioSectionId, UiStudioTabId[]> = {
  authoring: ["surfaces", "hud", "overlay"],
};

const STUDIO_SECTIONS: Array<{
  id: UiStudioSectionId;
  label: string;
  icon: IconName;
}> = [
  { id: "authoring", label: "Authoring", icon: "wrench" },
];


const STUDIO_SIDEBAR_SECTIONS: SidebarContentLayoutSection[] = STUDIO_SECTIONS.map(
  (section) => ({
    id: section.id,
    label: section.label,
    icon: <Icon name={section.icon} size={13} className="opacity-80" />,
    children: STUDIO_SECTION_TABS[section.id].map((tabId) => ({
      id: tabId,
      label: STUDIO_TAB_META[tabId].label,
      icon: <Icon name={STUDIO_TAB_META[tabId].icon} size={12} className="opacity-80" />,
    })),
  }),
);

function renderContextSummary(value: number | null): string {
  return value == null ? "None" : String(value);
}

export function UiStudioPanel() {
  const authoringContext = useAuthoringContext();
  const nav = useSidebarNav<UiStudioSectionId, UiStudioTabId>({
    sections: STUDIO_SIDEBAR_SECTIONS,
    initial: "surfaces",
    storageKey: 'ui-studio:nav',
  });
  const activeTab = nav.activeId as UiStudioTabId;
  const setActiveStudioTab = useCallback((nextTab: UiStudioTabId) => {
    if (STUDIO_TAB_ID_SET.has(nextTab)) {
      nav.navigate(nextTab);
    }
  }, [nav]);

  const activeTabMeta = useMemo(() => STUDIO_TAB_META[activeTab], [activeTab]);
  const activeSectionId = nav.activeSectionId;
  const activeSectionLabel = useMemo(
    () =>
      STUDIO_SECTIONS.find((section) => section.id === activeSectionId)
        ?.label ?? "Studio",
    [activeSectionId],
  );
  const targetValue = useMemo<UiStudioTargetContext>(
    () => ({
      tab: activeTab,
      tabs: STUDIO_TAB_IDS,
      worldId: authoringContext.worldId,
      projectId: authoringContext.projectId,
      projectSourceWorldId: authoringContext.projectSourceWorldId,
      source: authoringContext.source,
      followActive: authoringContext.followActive,
      isReady: authoringContext.isReady,
    }),
    [
      activeTab,
      authoringContext.worldId,
      authoringContext.projectId,
      authoringContext.projectSourceWorldId,
      authoringContext.source,
      authoringContext.followActive,
      authoringContext.isReady,
    ],
  );
  const actionsValue = useMemo<UiStudioActionsContext>(
    () => ({
      setTab: setActiveStudioTab,
    }),
    [setActiveStudioTab],
  );

  const targetProvider = useMemo(
    () => ({
      id: "ui-studio:target",
      label: "UI Studio Target",
      priority: 60,
      exposeToContextMenu: true,
      getValue: () => targetValue,
    }),
    [targetValue],
  );
  const actionsProvider = useMemo(
    () => ({
      id: "ui-studio:actions",
      label: "UI Studio Actions",
      priority: 60,
      exposeToContextMenu: true,
      getValue: () => actionsValue,
    }),
    [actionsValue],
  );

  // Local keeps studio interactions scoped to this panel tree; root makes
  // controls discoverable from sibling panel trees.
  useProvideCapability(CAP_UI_STUDIO_TARGET, targetProvider, [targetValue]);
  useProvideCapability(CAP_UI_STUDIO_TARGET, targetProvider, [targetValue], {
    scope: "root",
  });
  useProvideCapability(CAP_UI_STUDIO_ACTIONS, actionsProvider, [actionsValue]);
  useProvideCapability(
    CAP_UI_STUDIO_ACTIONS,
    actionsProvider,
    [actionsValue],
    { scope: "root" },
  );

  return (
    <div className="h-full w-full flex bg-white dark:bg-neutral-900">
      <SidebarContentLayout
        sections={STUDIO_SIDEBAR_SECTIONS}
        activeSectionId={nav.activeSectionId}
        onSelectSection={nav.selectSection}
        activeChildId={nav.activeChildId}
        onSelectChild={nav.selectChild}
        expandedSectionIds={nav.expandedSectionIds}
        onToggleExpand={nav.toggleExpand}
        sidebarTitle="UI Studio"
        sidebarWidth="w-56"
        variant="light"
        navClassName="space-y-1"
        contentClassName="overflow-hidden"
        collapsible
        expandedWidth={224}
        persistKey="ui-studio-sidebar"
      >
        <PanelShell
          header={
            <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/40 px-4 py-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {activeSectionLabel}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Icon name={activeTabMeta.icon} size={14} className="text-neutral-500 dark:text-neutral-400" />
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {activeTabMeta.label}
                  </h2>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {activeTabMeta.description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] leading-5 text-neutral-600 dark:text-neutral-300">
                <span className={clsx("rounded border border-neutral-300/80 dark:border-neutral-700 px-2 py-0.5")}>
                  <Icon name="map" size={11} className="inline mr-1 align-[-1px] opacity-75" />
                  World: {renderContextSummary(authoringContext.worldId)}
                </span>
                <span className={clsx("rounded border border-neutral-300/80 dark:border-neutral-700 px-2 py-0.5")}>
                  <Icon name="folder" size={11} className="inline mr-1 align-[-1px] opacity-75" />
                  Project: {renderContextSummary(authoringContext.projectId)}
                </span>
                <span className={clsx("rounded border border-neutral-300/80 dark:border-neutral-700 px-2 py-0.5")}>
                  <Icon name="link" size={11} className="inline mr-1 align-[-1px] opacity-75" />
                  Source: {authoringContext.source}
                </span>
              </div>
            </div>
          }
          bodyScroll={false}
        >
          {activeTab === "surfaces" && <SurfaceWorkbenchPanel />}
          {activeTab === "hud" && <HudDesignerPanel />}
          {activeTab === "overlay" && <OverlayConfig embedded />}
        </PanelShell>
      </SidebarContentLayout>
    </div>
  );
}
