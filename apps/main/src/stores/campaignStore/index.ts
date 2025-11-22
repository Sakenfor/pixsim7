import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Campaign, CampaignProgression, CampaignType } from '../../modules/campaign';

interface CampaignState {
  /** All campaigns by ID */
  campaigns: Record<string, Campaign>;

  /** Campaign progression state (per world) */
  progression: Record<number, Record<string, CampaignProgression>>;  // worldId → campaignId → progression

  /** Currently active campaign ID */
  currentCampaignId: string | null;

  // CRUD operations
  createCampaign: (title: string, type: CampaignType, worldId: number) => string;
  getCampaign: (id: string) => Campaign | null;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;

  // Arc management
  addArcToCampaign: (campaignId: string, arcGraphId: string, order?: number) => void;
  removeArcFromCampaign: (campaignId: string, arcGraphId: string) => void;
  reorderArcs: (campaignId: string, arcGraphIds: string[]) => void;

  // Progression tracking
  startCampaign: (worldId: number, campaignId: string) => void;
  completeCampaign: (worldId: number, campaignId: string) => void;
  updateCampaignProgress: (worldId: number, campaignId: string, currentArcId: string) => void;
  completeArc: (worldId: number, campaignId: string, arcGraphId: string) => void;
  getCampaignProgression: (worldId: number, campaignId: string) => CampaignProgression | null;

  // Selection
  setCurrentCampaign: (id: string | null) => void;
  getCurrentCampaign: () => Campaign | null;

  // Query helpers
  getCampaignsForWorld: (worldId: number) => Campaign[];
  getMainStoryCampaigns: (worldId: number) => Campaign[];
  getActiveCampaigns: (worldId: number) => Campaign[];

  // Import/Export
  exportCampaign: (id: string) => string | null;
  importCampaign: (json: string) => string | null;
}

export const useCampaignStore = create<CampaignState>()(
  devtools(
    (set, get) => ({
      campaigns: {},
      progression: {},
      currentCampaignId: null,

      createCampaign: (title, type, worldId) => {
        const id = crypto.randomUUID();
        const campaign: Campaign = {
          id,
          title,
          type,
          worldId,
          arcs: [],
          metadata: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [id]: campaign,
          },
        }), false, 'createCampaign');

        return id;
      },

      getCampaign: (id) => {
        return get().campaigns[id] || null;
      },

      updateCampaign: (id, patch) => {
        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [id]: {
              ...state.campaigns[id],
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'updateCampaign');
      },

      deleteCampaign: (id) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.campaigns;
          return {
            campaigns: rest,
            currentCampaignId: state.currentCampaignId === id ? null : state.currentCampaignId,
          };
        }, false, 'deleteCampaign');
      },

      addArcToCampaign: (campaignId, arcGraphId, order) => {
        const campaign = get().campaigns[campaignId];
        if (!campaign) return;

        const maxOrder = Math.max(0, ...campaign.arcs.map(a => a.order));
        const newOrder = order !== undefined ? order : maxOrder + 1;

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [campaignId]: {
              ...campaign,
              arcs: [
                ...campaign.arcs,
                { arcGraphId, order: newOrder },
              ],
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'addArcToCampaign');
      },

      removeArcFromCampaign: (campaignId, arcGraphId) => {
        const campaign = get().campaigns[campaignId];
        if (!campaign) return;

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [campaignId]: {
              ...campaign,
              arcs: campaign.arcs.filter(a => a.arcGraphId !== arcGraphId),
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'removeArcFromCampaign');
      },

      reorderArcs: (campaignId, arcGraphIds) => {
        const campaign = get().campaigns[campaignId];
        if (!campaign) return;

        const reordered = arcGraphIds.map((arcGraphId, index) => {
          const existing = campaign.arcs.find(a => a.arcGraphId === arcGraphId);
          return {
            arcGraphId,
            order: index,
            optional: existing?.optional,
            unlockConditions: existing?.unlockConditions,
            parallel: existing?.parallel,
          };
        });

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [campaignId]: {
              ...campaign,
              arcs: reordered,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'reorderArcs');
      },

      startCampaign: (worldId, campaignId) => {
        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                campaignId,
                status: 'in_progress',
                completedArcIds: [],
                startedAt: new Date().toISOString(),
              },
            },
          },
        }), false, 'startCampaign');
      },

      completeCampaign: (worldId, campaignId) => {
        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                ...state.progression[worldId]?.[campaignId],
                campaignId,
                status: 'completed',
                completedAt: new Date().toISOString(),
              },
            },
          },
        }), false, 'completeCampaign');
      },

      updateCampaignProgress: (worldId, campaignId, currentArcId) => {
        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                ...state.progression[worldId]?.[campaignId],
                campaignId,
                currentArcId,
                status: 'in_progress',
              },
            },
          },
        }), false, 'updateCampaignProgress');
      },

      completeArc: (worldId, campaignId, arcGraphId) => {
        const progression = get().progression[worldId]?.[campaignId];
        if (!progression) return;

        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                ...progression,
                completedArcIds: [...new Set([...progression.completedArcIds, arcGraphId])],
              },
            },
          },
        }), false, 'completeArc');
      },

      getCampaignProgression: (worldId, campaignId) => {
        return get().progression[worldId]?.[campaignId] || null;
      },

      setCurrentCampaign: (id) => {
        set({ currentCampaignId: id }, false, 'setCurrentCampaign');
      },

      getCurrentCampaign: () => {
        const { currentCampaignId, campaigns } = get();
        return currentCampaignId ? campaigns[currentCampaignId] || null : null;
      },

      getCampaignsForWorld: (worldId) => {
        const { campaigns } = get();
        return Object.values(campaigns).filter(c => c.worldId === worldId);
      },

      getMainStoryCampaigns: (worldId) => {
        const { campaigns } = get();
        return Object.values(campaigns).filter(
          c => c.worldId === worldId && c.type === 'main_story'
        );
      },

      getActiveCampaigns: (worldId) => {
        const { campaigns, progression } = get();
        const worldProgression = progression[worldId] || {};
        return Object.values(campaigns).filter(
          c => c.worldId === worldId && worldProgression[c.id]?.status === 'in_progress'
        );
      },

      exportCampaign: (id) => {
        const campaign = get().campaigns[id];
        return campaign ? JSON.stringify(campaign, null, 2) : null;
      },

      importCampaign: (json) => {
        try {
          const campaign = JSON.parse(json) as Campaign;
          set((state) => ({
            campaigns: {
              ...state.campaigns,
              [campaign.id]: campaign,
            },
          }), false, 'importCampaign');
          return campaign.id;
        } catch (error) {
          console.error('Failed to import campaign:', error);
          return null;
        }
      },
    }),
    { name: 'CampaignStore' }
  )
);
