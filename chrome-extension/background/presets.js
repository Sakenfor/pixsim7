/**
 * Quick Generate Presets
 */

export const QUICK_GENERATE_PRESET_LIBRARY = {
  __global: [
    {
      id: 'cinematic_orbit',
      name: 'Cinematic Orbit',
      prompt: [
        'Cinematic camera slowly orbits around the character maintaining the exact starting pose,',
        'lighting staying consistent and grounded in a moody neon alley.',
        'The subject keeps eye contact with the lens as fabrics ripple gently,',
        'emphasizing confident body language, subtle breathing detail, and atmospheric depth of field.'
      ].join(' ')
    },
    {
      id: 'creature_maintain_pose',
      name: 'Creature Maintains Pose',
      prompt: [
        'Character maintains original pose while a towering creature looms behind them,',
        'hands hovering just above their waist without actually touching.',
        'Camera glides in a slow 180° arc, capturing tension, shallow depth of field, and cinematic rim lighting.',
        'Consistent wardrobe & lighting, emphasize anticipation and unstoppable chemistry.'
      ].join(' ')
    },
    {
      id: 'silk_drift',
      name: 'Silk Drift Portrait',
      prompt: [
        'Soft portrait of character wrapped in translucent fabrics drifting in zero gravity,',
        'camera locked on their face as fabrics swirl around, creating delicate trails of light.',
        'Subject floats but maintains subtle motion in hands and eyes.',
        'Color palette is warm gold + deep teal with volumetric lighting and bokeh.'
      ].join(' ')
    }
  ],
  pixverse: [
    {
      id: 'pixverse_mantle',
      name: 'Pixverse Mantle',
      prompt: [
        'She holds a powerful stance at center frame, city-scale holograms pulsing behind her.',
        'Camera performs a gentle push-in as energy ribbons orbit around, syncing with her breathing.',
        'Maintain pose and silhouette consistency; emphasize bold contrasty lighting and reflective surfaces.'
      ].join(' ')
    }
  ]
};

export function getQuickGeneratePresets(providerId) {
  const scoped = QUICK_GENERATE_PRESET_LIBRARY[providerId] || [];
  const global = QUICK_GENERATE_PRESET_LIBRARY.__global || [];
  const combined = [...scoped, ...global];
  const seen = new Set();
  return combined.filter((preset) => {
    const key = preset.id || preset.name || preset.prompt;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const PROVIDER_TARGETS = {
  pixverse: { domain: 'pixverse.ai', url: 'https://app.pixverse.ai' },
  runway: { domain: 'runwayml.com', url: 'https://app.runwayml.com' },
  pika: { domain: 'pika.art', url: 'https://app.pika.art' },
  sora: { domain: 'chatgpt.com', url: 'https://chatgpt.com' },
};
