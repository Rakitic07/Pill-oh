export interface CustomTheme {
  bg: string;
  accent: string;
}

export const DEFAULT_CUSTOM: CustomTheme = { bg: '#1c1f26', accent: '#ff7a59' };

type RGB = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

/** Values may come from localStorage, so only well-formed hex colours are accepted. */
export function sanitizeCustom(v: Partial<CustomTheme> | null | undefined): CustomTheme {
  return {
    bg: isHexColor(v?.bg) ? v.bg : DEFAULT_CUSTOM.bg,
    accent: isHexColor(v?.accent) ? v.accent : DEFAULT_CUSTOM.accent,
  };
}

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
const list = (c: RGB) => c.map(Math.round).join(', ');
const tint = (c: RGB, t: number) => toHex(mix(c, WHITE, t));
const shade = (c: RGB, t: number) => toHex(mix(c, BLACK, t));

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export const isDarkColor = (hex: string) => luminance(hexToRgb(hex)) < 0.18;

/** Derives the full clay palette from a background and an accent colour. */
export function buildThemeVars(theme: CustomTheme): Record<string, string> {
  const { bg, accent } = sanitizeCustom(theme);
  const B = hexToRgb(bg);
  const A = hexToRgb(accent);
  const dark = luminance(B) < 0.18;

  return {
    'color-scheme': dark ? 'dark' : 'light',
    '--bg': bg,
    '--surface': dark ? tint(B, 0.07) : tint(B, 0.6),
    '--inset': dark ? shade(B, 0.22) : shade(B, 0.03),
    '--text': dark ? tint(mix(B, A, 0.08), 0.88) : shade(mix(B, A, 0.15), 0.75),
    '--muted': dark ? tint(B, 0.5) : shade(mix(B, A, 0.1), 0.42),
    '--primary': accent,
    '--primary-2': tint(A, 0.3),
    '--primary-rgb': list(A),
    '--primary-dark-rgb': list(mix(A, BLACK, 0.45)),
    '--on-primary': luminance(A) > 0.45 ? shade(A, 0.82) : '#ffffff',
    '--sh': dark ? '0, 0, 0' : list(mix(mix(B, A, 0.3), BLACK, 0.4)),
    '--sh-k': dark ? '2.4' : '1',
    '--hl': dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.92)',
    '--glow-1': toHex(mix(B, A, dark ? 0.12 : 0.18)),
    '--glow-2': dark ? tint(B, 0.04) : tint(B, 0.4),
    '--glow-3': toHex(mix(B, A, dark ? 0.06 : 0.1)),
    '--logo-1': tint(A, 0.35),
    '--logo-2': accent,
    '--logo-rgb': list(A),
    '--upcoming': dark ? tint(B, 0.22) : toHex(mix(mix(B, A, 0.2), BLACK, 0.08)),
  };
}

const VAR_KEYS = Object.keys(buildThemeVars(DEFAULT_CUSTOM));

export function applyThemeVars(vars: Record<string, string> | null) {
  const style = document.documentElement.style;
  for (const k of VAR_KEYS) style.removeProperty(k);
  if (vars) for (const [k, v] of Object.entries(vars)) style.setProperty(k, v);
}
