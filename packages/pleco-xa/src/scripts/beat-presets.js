// Preset beat patterns for injection into quantum sequences

/* simple 8-step bars that read nicely in the same op language */
export const hipHop = [
  'silence','half','move','reverse','silence','stutter','move','reverse'
];

export const regaeton = [
  'double','reverse','silence','move','stutter','reverse','move','silence'
];

export const dubstep = [
  'half','stutter','reverse','silence','half','stutter','move','reverse'
];

export const breakbeat = [
  'move','reverse','half','stutter','move','reverse','silence','double'
];

export const techno = [
  'half','move','half','move','reverse','stutter','reverse','move'
];

export const jungle = [
  'stutter','reverse','half','move','stutter','half','reverse','move'
];

// Collection of all presets
export const allPresets = [
  hipHop, regaeton, dubstep, breakbeat, techno, jungle
];

// Get random preset
export function randomPreset() {
  return allPresets[Math.floor(Math.random() * allPresets.length)];
}