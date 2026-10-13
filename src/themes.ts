export type PresetThemeId = 'ember' | 'lavender' | 'noir' | 'aurora' | 'ocean' | 'rose' | 'teal';
export type ThemeId = PresetThemeId | 'custom';

/** Used until the user picks a theme; keep public/theme-init.js, index.html and the manifest in sync. */
export const DEFAULT_THEME: ThemeId = 'ember';

export const THEMES: { id: PresetThemeId; name: string; colors: [string, string, string] }[] = [
  { id: 'ember', name: 'Ember Coral (dark)', colors: ['#1c1f26', '#ff7a59', '#4a505e'] },
  { id: 'lavender', name: 'Lavender Clay', colors: ['#e9ecfb', '#a99dff', '#8b7cf6'] },
  { id: 'noir', name: 'Noir Gold (dark)', colors: ['#1d1d20', '#ffdb4d', '#55555e'] },
  { id: 'ocean', name: 'Ocean Breeze', colors: ['#e1ebf7', '#76afff', '#3d8bfd'] },
  { id: 'rose', name: 'Rose Quartz', colors: ['#f7e7ee', '#f38dbd', '#9b87f5'] },
  { id: 'aurora', name: 'Midnight Aurora (dark)', colors: ['#141a2c', '#74e8f2', '#7a5cf0'] },
  { id: 'teal', name: 'Teal Lagoon', colors: ['#dff1ef', '#4fd0c4', '#ff976a'] },
];

export const isThemeId = (v: unknown): v is ThemeId =>
  v === 'custom' || THEMES.some((t) => t.id === v);
