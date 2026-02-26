import type { ResolverWorkbenchFixture } from './types';

export const resolverWorkbenchFixtures: ResolverWorkbenchFixture[] = [
  {
    id: 'police-allure-basic',
    name: 'Police Allure (Basic)',
    description: 'Base uniform aesthetic + wardrobe modifier target with allure-like constraints.',
    request: {
      resolver_id: 'next_v1',
      seed: 42,
      intent: {
        targets: [
          { key: 'uniform_aesthetic', kind: 'slot', label: 'Uniform aesthetic', category: 'aesthetic' },
          { key: 'wardrobe_modifier', kind: 'slot', label: 'Wardrobe modifier', category: 'wardrobe_modifier' },
        ],
        desired_tags_by_target: {
          uniform_aesthetic: { aesthetic: 'police_uniform', variant: 'duty' },
          wardrobe_modifier: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'subtle' },
        },
        avoid_tags_by_target: {
          wardrobe_modifier: { allure_level: 'high' },
        },
        required_capabilities_by_target: {
          wardrobe_modifier: ['wardrobe_modifier'],
        },
      },
      candidates_by_target: {
        uniform_aesthetic: [
          {
            block_id: 'police_uniform_duty_01',
            text: 'a practical duty police uniform with crisp tailoring',
            tags: { aesthetic: 'police_uniform', variant: 'duty' },
            avg_rating: 4.2,
            capabilities: ['aesthetic_base'],
          },
          {
            block_id: 'police_uniform_sleek_01',
            text: 'a sleek police uniform silhouette with polished lines',
            tags: { aesthetic: 'police_uniform', variant: 'sleek' },
            avg_rating: 4.8,
            capabilities: ['aesthetic_base'],
          },
        ],
        wardrobe_modifier: [
          {
            block_id: 'wardrobe_allure_preserve_01',
            text: 'fit preserved from the source image',
            tags: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'preserve', modesty_level: 'balanced' },
            capabilities: ['wardrobe_modifier'],
          },
          {
            block_id: 'wardrobe_allure_subtle_01',
            text: 'subtle fitted tailoring that reads confident but restrained',
            tags: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'subtle', tightness: 'fitted' },
            capabilities: ['wardrobe_modifier'],
            avg_rating: 4.0,
          },
          {
            block_id: 'wardrobe_allure_high_01',
            text: 'skin-tight daring fit emphasizing form',
            tags: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'high', tightness: 'skin_tight' },
            capabilities: ['wardrobe_modifier'],
            avg_rating: 4.5,
          },
        ],
      },
      constraints: [
        {
          id: 'uniform-must-be-police',
          kind: 'requires_tag',
          target_key: 'uniform_aesthetic',
          payload: { tag: 'aesthetic', value: 'police_uniform' },
        },
        {
          id: 'wardrobe-must-target-wardrobe',
          kind: 'requires_tag',
          target_key: 'wardrobe_modifier',
          payload: { tag: 'modifier_target', value: 'wardrobe' },
        },
      ],
      debug: {
        include_trace: true,
        include_candidate_scores: true,
      },
      context: {
        template_slug: 'police-precinct-break-room',
        resolver_experiment: 'next_v1_fixture',
      },
    },
  },
  {
    id: 'tribal-theme-allure',
    name: 'Tribal Theme + Allure',
    description: 'Demonstrates split between base aesthetic and allure wardrobe modifiers for tribal-style theme.',
    request: {
      resolver_id: 'next_v1',
      seed: 7,
      intent: {
        targets: [
          { key: 'aesthetic_theme', kind: 'slot', label: 'Aesthetic theme', category: 'aesthetic' },
          { key: 'subgenre_cue', kind: 'slot', label: 'Sub-genre cue', category: 'theme_cue' },
          { key: 'wardrobe_modifier', kind: 'slot', label: 'Wardrobe modifier', category: 'wardrobe_modifier' },
        ],
        desired_tags_by_target: {
          aesthetic_theme: { theme_family: 'tribal_handcrafted', theme_variant: 'earthy' },
          subgenre_cue: { theme_family: 'tribal_handcrafted', theme_variant: 'earthy' },
          wardrobe_modifier: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'medium' },
        },
        required_capabilities_by_target: {
          wardrobe_modifier: ['wardrobe_modifier'],
        },
      },
      candidates_by_target: {
        aesthetic_theme: [
          {
            block_id: 'tribal_theme_earthy_01',
            text: 'handcrafted tribal garments with earthy woven textures',
            tags: { theme_family: 'tribal_handcrafted', theme_variant: 'earthy' },
            capabilities: ['aesthetic_base'],
          },
          {
            block_id: 'tribal_theme_ceremonial_01',
            text: 'ceremonial tribal styling with ornate accents',
            tags: { theme_family: 'tribal_handcrafted', theme_variant: 'ceremonial' },
            capabilities: ['aesthetic_base'],
            avg_rating: 4.7,
          },
        ],
        subgenre_cue: [
          {
            block_id: 'tribal_cue_earthy_01',
            text: 'earthy handwoven cue with natural fibers',
            tags: { theme_family: 'tribal_handcrafted', theme_variant: 'earthy' },
          },
          {
            block_id: 'tribal_cue_ceremonial_01',
            text: 'ceremonial cue with ritual ornament influence',
            tags: { theme_family: 'tribal_handcrafted', theme_variant: 'ceremonial' },
          },
        ],
        wardrobe_modifier: [
          {
            block_id: 'wardrobe_allure_medium_01',
            text: 'body-conforming fit with balanced modesty and strong silhouette lines',
            tags: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'medium', tightness: 'tight' },
            capabilities: ['wardrobe_modifier'],
          },
          {
            block_id: 'wardrobe_allure_subtle_tribal_01',
            text: 'subtle fitted tailoring preserving handcrafted readability',
            tags: { modifier_family: 'allure', modifier_target: 'wardrobe', allure_level: 'subtle', tightness: 'fitted' },
            capabilities: ['wardrobe_modifier'],
          },
        ],
      },
      constraints: [
        {
          id: 'theme-sync-cue-family',
          kind: 'requires_tag',
          target_key: 'subgenre_cue',
          payload: { tag: 'theme_family', value: 'tribal_handcrafted' },
        },
      ],
      debug: {
        include_trace: true,
        include_candidate_scores: true,
      },
      context: {
        template_slug: 'tribal-theme-woman',
        resolver_experiment: 'next_v1_fixture',
      },
    },
  },

  // -----------------------------------------------------------------------
  {
    id: 'forbid-pair-fashion-accessory',
    name: 'Forbid Pair (Fashion + Accessory)',
    description:
      'Demonstrates forbid_pair: selecting the "ceremonial" fashion block forbids the "casual_accessory" block in the accessory target.',
    request: {
      resolver_id: 'next_v1',
      seed: 99,
      intent: {
        targets: [
          { key: 'fashion_theme', kind: 'slot', label: 'Fashion theme', category: 'aesthetic' },
          { key: 'accessory_style', kind: 'slot', label: 'Accessory style', category: 'accessory' },
        ],
        desired_tags_by_target: {
          fashion_theme: { aesthetic: 'ceremonial', variant: 'formal' },
          accessory_style: { accessory_family: 'jewelry' },
        },
      },
      candidates_by_target: {
        fashion_theme: [
          {
            block_id: 'fashion_ceremonial_formal',
            text: 'ornate ceremonial formal styling with structured silhouette',
            tags: { aesthetic: 'ceremonial', variant: 'formal' },
            avg_rating: 4.6,
            capabilities: ['aesthetic_base'],
          },
          {
            block_id: 'fashion_casual_relaxed',
            text: 'relaxed casual everyday styling with loose drape',
            tags: { aesthetic: 'casual', variant: 'relaxed' },
            avg_rating: 4.2,
            capabilities: ['aesthetic_base'],
          },
        ],
        accessory_style: [
          {
            block_id: 'casual_accessory_01',
            text: 'minimal casual accessories — plain band and small bag',
            tags: { accessory_family: 'casual', formality: 'low' },
            capabilities: ['accessory'],
            avg_rating: 3.8,
          },
          {
            block_id: 'formal_jewelry_01',
            text: 'structured formal jewelry — collar necklace and cuff',
            tags: { accessory_family: 'jewelry', formality: 'high' },
            capabilities: ['accessory'],
            avg_rating: 4.5,
          },
        ],
      },
      constraints: [
        {
          id: 'forbid-casual-accessory-with-ceremonial',
          kind: 'forbid_pair',
          target_key: 'accessory_style',
          payload: {
            other_target_key: 'fashion_theme',
            other_block_id: 'fashion_ceremonial_formal',
            this_block_id: 'casual_accessory_01',
          },
        },
      ],
      debug: { include_trace: true, include_candidate_scores: true },
      context: {
        template_slug: 'ceremony-formal-look',
        resolver_experiment: 'next_v1_fixture',
      },
    },
  },

  // -----------------------------------------------------------------------
  {
    id: 'scene-lighting-atmosphere-three-slot',
    name: 'Scene + Lighting + Atmosphere (requires_other_selected)',
    description:
      'Three-target fixture: scene_base must resolve before atmosphere_cue (requires_other_selected). Lighting floats freely.',
    request: {
      resolver_id: 'next_v1',
      seed: 17,
      intent: {
        targets: [
          { key: 'scene_base', kind: 'slot', label: 'Scene base', category: 'scene' },
          { key: 'lighting_modifier', kind: 'slot', label: 'Lighting modifier', category: 'lighting' },
          { key: 'atmosphere_cue', kind: 'slot', label: 'Atmosphere cue', category: 'atmosphere' },
        ],
        desired_tags_by_target: {
          scene_base: { scene_family: 'urban_night', mood: 'tense' },
          lighting_modifier: { lighting_style: 'hard_contrast', color_temp: 'cool' },
          atmosphere_cue: { atmosphere_family: 'suspense', intensity: 'high' },
        },
        required_capabilities_by_target: {
          lighting_modifier: ['lighting'],
          atmosphere_cue: ['atmosphere'],
        },
      },
      candidates_by_target: {
        scene_base: [
          {
            block_id: 'urban_night_alley_01',
            text: 'rain-slicked urban alley at night, deep shadow pools',
            tags: { scene_family: 'urban_night', mood: 'tense', setting: 'alley' },
            capabilities: ['scene'],
            avg_rating: 4.7,
          },
          {
            block_id: 'urban_night_rooftop_01',
            text: 'windy city rooftop at night, distant neon glow',
            tags: { scene_family: 'urban_night', mood: 'melancholic', setting: 'rooftop' },
            capabilities: ['scene'],
            avg_rating: 4.4,
          },
        ],
        lighting_modifier: [
          {
            block_id: 'lighting_hard_contrast_cool',
            text: 'hard-edge cold blue overhead lighting, stark shadow lines',
            tags: { lighting_style: 'hard_contrast', color_temp: 'cool' },
            capabilities: ['lighting'],
            avg_rating: 4.3,
          },
          {
            block_id: 'lighting_soft_warm',
            text: 'warm diffuse soft lighting, gentle fill shadows',
            tags: { lighting_style: 'soft_fill', color_temp: 'warm' },
            capabilities: ['lighting'],
            avg_rating: 4.6,
          },
        ],
        atmosphere_cue: [
          {
            block_id: 'atmosphere_suspense_high',
            text: 'taut suspenseful atmosphere, slow-build dread, held breath',
            tags: { atmosphere_family: 'suspense', intensity: 'high' },
            capabilities: ['atmosphere'],
            avg_rating: 4.5,
          },
          {
            block_id: 'atmosphere_calm_low',
            text: 'quiet contemplative atmosphere, sparse stillness',
            tags: { atmosphere_family: 'calm', intensity: 'low' },
            capabilities: ['atmosphere'],
            avg_rating: 4.2,
          },
        ],
      },
      constraints: [
        {
          id: 'atmosphere-requires-scene-base',
          kind: 'requires_other_selected',
          target_key: 'atmosphere_cue',
          payload: { other_target_key: 'scene_base' },
        },
      ],
      debug: { include_trace: true, include_candidate_scores: true },
      context: {
        template_slug: 'urban-night-scene',
        resolver_experiment: 'next_v1_fixture',
      },
    },
  },

  // -----------------------------------------------------------------------
  {
    id: 'editorial-mood-scoring-only',
    name: 'Editorial Mood (Scoring Only)',
    description:
      'Single-target fixture with many candidates. Tests pure scoring via desired/avoid tags without hard constraints.',
    request: {
      resolver_id: 'next_v1',
      seed: 3,
      intent: {
        targets: [
          { key: 'editorial_mood', kind: 'slot', label: 'Editorial mood', category: 'mood' },
        ],
        desired_tags_by_target: {
          editorial_mood: { mood_family: 'editorial', energy: 'sharp', finish: 'matte' },
        },
        avoid_tags_by_target: {
          editorial_mood: { energy: 'soft' },
        },
      },
      candidates_by_target: {
        editorial_mood: [
          {
            block_id: 'mood_editorial_sharp_matte',
            text: 'crisp editorial sharpness — bold contrast, matte finish',
            tags: { mood_family: 'editorial', energy: 'sharp', finish: 'matte' },
            avg_rating: 4.4,
            capabilities: ['mood'],
          },
          {
            block_id: 'mood_editorial_soft_glow',
            text: 'editorial glow — soft luminous diffusion',
            tags: { mood_family: 'editorial', energy: 'soft', finish: 'glow' },
            avg_rating: 4.9,
            capabilities: ['mood'],
          },
          {
            block_id: 'mood_editorial_neutral_satin',
            text: 'neutral editorial mood — balanced mid-contrast satin finish',
            tags: { mood_family: 'editorial', energy: 'neutral', finish: 'satin' },
            avg_rating: 4.1,
            capabilities: ['mood'],
          },
          {
            block_id: 'mood_raw_grit',
            text: 'raw gritty mood — rough texture, desaturated earth tones',
            tags: { mood_family: 'raw', energy: 'sharp', finish: 'matte' },
            avg_rating: 3.9,
            capabilities: ['mood'],
          },
        ],
      },
      constraints: [],
      debug: { include_trace: true, include_candidate_scores: true },
      context: {
        template_slug: 'editorial-fashion-shoot',
        resolver_experiment: 'next_v1_fixture',
      },
    },
  },
];

export function getResolverWorkbenchFixture(fixtureId: string | null | undefined): ResolverWorkbenchFixture | null {
  if (!fixtureId) return null;
  return resolverWorkbenchFixtures.find((fixture) => fixture.id === fixtureId) ?? null;
}
