// Renders the PWA icons and the link-preview (Open Graph) image into public/.
// Run with `npm run assets` after changing the artwork below.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const out = (name) => new URL(`../public/${name}`, import.meta.url);

// The Pill-oh mark: a two-tone clay capsule with a "dose taken" check badge, on a gold clay tile.
// Keep in sync with src/components/Logo.tsx, which draws the same mark with theme colours.
const mark = (id) => `
  <defs>
    <linearGradient id="${id}-cream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6dbc0"/>
    </linearGradient>
    <linearGradient id="${id}-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3118"/><stop offset="1" stop-color="#17130a"/>
    </linearGradient>
    <linearGradient id="${id}-mint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7cf0b0"/><stop offset="1" stop-color="#25a862"/>
    </linearGradient>
    <clipPath id="${id}-cap"><rect x="91" y="176" width="290" height="120" rx="60"/></clipPath>
    <filter id="${id}-drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="8" dy="16" stdDeviation="14" flood-color="#5a3c00" flood-opacity="0.45"/>
    </filter>
  </defs>
  <g transform="rotate(-40 236 236)" filter="url(#${id}-drop)">
    <g clip-path="url(#${id}-cap)">
      <rect x="91" y="176" width="145" height="120" fill="url(#${id}-cream)"/>
      <rect x="236" y="176" width="145" height="120" fill="url(#${id}-dark)"/>
      <rect x="232" y="176" width="8" height="120" fill="#000" opacity="0.18"/>
    </g>
    <rect x="121" y="194" width="226" height="20" rx="10" fill="#fff" opacity="0.5"/>
  </g>
  <g filter="url(#${id}-drop)">
    <circle cx="360" cy="360" r="86" fill="#fff8e1"/>
    <circle cx="360" cy="360" r="70" fill="url(#${id}-mint)"/>
    <path d="M326 364l24 24 46-52" stroke="#fff" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const tile = (id) => `
  <defs>
    <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#e3a500"/>
    </linearGradient>
    <radialGradient id="${id}-hl" cx="22%" cy="18%" r="60%">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-lo" cx="88%" cy="92%" r="60%">
      <stop offset="0" stop-color="#8a5c00" stop-opacity="0.45"/><stop offset="1" stop-color="#8a5c00" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

const centred = (scale, body) => `<g transform="translate(256 262) scale(${scale}) translate(-256 -262)">${body}</g>`;

// Full-bleed square: works as a regular icon, an Android maskable icon (content kept in the safe circle), and an iOS icon.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${tile('t')}
  <rect width="512" height="512" fill="url(#t-gold)"/><rect width="512" height="512" fill="url(#t-hl)"/><rect width="512" height="512" fill="url(#t-lo)"/>
  ${centred(0.74, mark('m'))}
</svg>`;

// Rounded clay tile: favicon and README logo.
const logoTile = (id) => `
  ${tile(id)}
  <rect width="512" height="512" rx="128" fill="url(#${id}-gold)"/>
  <rect width="512" height="512" rx="128" fill="url(#${id}-hl)"/>
  <rect width="512" height="512" rx="128" fill="url(#${id}-lo)"/>
  <rect x="6" y="6" width="500" height="500" rx="122" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="6"/>
  ${centred(0.82, mark(`${id}m`))}`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${logoTile('f')}</svg>`;

// Wide README banner: logo + wordmark.
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="400" viewBox="0 0 1280 400">
  <defs>
    <radialGradient id="bb1" cx="15%" cy="20%" r="60%"><stop offset="0" stop-color="#3a3014"/><stop offset="1" stop-color="#141416" stop-opacity="0"/></radialGradient>
    <filter id="bsoft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="10" dy="16" stdDeviation="16" flood-color="#000" flood-opacity="0.6"/></filter>
  </defs>
  <rect width="1280" height="400" rx="40" fill="#141416"/>
  <rect width="1280" height="400" rx="40" fill="url(#bb1)"/>
  <g transform="translate(110 72) scale(0.5)" filter="url(#bsoft)">${logoTile('b')}</g>
  <text x="430" y="200" font-size="120" font-weight="800" fill="#f3eedd" letter-spacing="-3">Pill-oh</text>
  <text x="436" y="262" font-size="36" font-weight="600" fill="#9b968a">Your clay-soft medicine tracker</text>
</svg>`;

const row = (y, label, time, state) => {
  const mark = {
    taken: `<circle cx="1052" cy="${y + 42}" r="24" fill="#4fcf8a"/><path d="M1040 ${y + 42}l9 9 16-18" stroke="#0f2a1b" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    soon: `<circle cx="1052" cy="${y + 42}" r="24" fill="#f5c518"/><path d="M1052 ${y + 30}v13l8 6" stroke="#1d1904" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    missed: `<circle cx="1052" cy="${y + 42}" r="24" fill="#ef6b6b"/><path d="M1043 ${y + 33}l18 18M1061 ${y + 33}l-18 18" stroke="#2b0d0d" stroke-width="6" stroke-linecap="round"/>`,
  }[state];
  return `
  <g filter="url(#soft)">
    <rect x="700" y="${y}" width="400" height="84" rx="26" fill="#222226"/>
  </g>
  <rect x="701" y="${y + 1}" width="398" height="40" rx="25" fill="#fff" opacity="0.03"/>
  <text x="732" y="${y + 38}" font-size="26" font-weight="700" fill="#f3eedd">${label}</text>
  <text x="732" y="${y + 66}" font-size="20" font-weight="600" fill="#9b968a">${time}</text>
  ${mark}`;
};

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g1" cx="12%" cy="10%" r="55%"><stop offset="0" stop-color="#3a3014"/><stop offset="1" stop-color="#141416" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="90%" cy="95%" r="50%"><stop offset="0" stop-color="#2a2412"/><stop offset="1" stop-color="#141416" stop-opacity="0"/></radialGradient>
    <filter id="soft" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="8" dy="12" stdDeviation="12" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <clipPath id="iconclip"><rect width="512" height="512" rx="120"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="#141416"/>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <rect width="1200" height="630" fill="url(#g2)"/>
  <circle cx="610" cy="560" r="34" fill="#f5c518" opacity="0.06"/>
  <circle cx="660" cy="90" r="20" fill="#f5c518" opacity="0.07"/>
  <circle cx="1140" cy="70" r="46" fill="#f5c518" opacity="0.05"/>

  <g transform="translate(84 92) scale(0.3)" filter="url(#soft)">${logoTile('o')}</g>
  <text x="84" y="330" font-size="92" font-weight="800" fill="#f3eedd" letter-spacing="-2">Pill-oh</text>
  <text x="88" y="384" font-size="32" font-weight="600" fill="#9b968a">Your clay-soft medicine tracker</text>

  <g font-size="25" font-weight="700" fill="#f3eedd">
    <circle cx="100" cy="450" r="8" fill="#4fcf8a"/><text x="122" y="459">Tick off each dose as you take it</text>
    <circle cx="100" cy="500" r="8" fill="#f5c518"/><text x="122" y="509">Gentle colour cues as a dose gets close</text>
    <circle cx="100" cy="550" r="8" fill="#ef6b6b"/><text x="122" y="559">Report card for how punctual you were</text>
  </g>

  <text x="702" y="140" font-size="22" font-weight="800" fill="#f5c518" letter-spacing="3">TODAY</text>
  ${row(166, 'Metformin · 500 mg', '8:00 AM · on time', 'taken')}
  ${row(270, 'Vitamin D', '1:00 PM · due soon', 'soon')}
  ${row(374, 'Amlodipine · 5 mg', '9:00 PM · missed', 'missed')}
  <rect x="700" y="490" width="400" height="18" rx="9" fill="#1a1a1d"/>
  <rect x="700" y="490" width="267" height="18" rx="9" fill="#f5c518"/>
  <text x="700" y="548" font-size="22" font-weight="700" fill="#9b968a">2 of 3 doses on track</text>
</svg>`;

const render = (svg, width) =>
  new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Avenir Next' },
  })
    .render()
    .asPng();

writeFileSync(out('icon-192.png'), render(icon, 192));
writeFileSync(out('icon-512.png'), render(icon, 512));
writeFileSync(out('apple-touch-icon.png'), render(icon, 180));
writeFileSync(out('favicon.svg'), favicon);
writeFileSync(out('logo.svg'), favicon);
writeFileSync(out('logo-512.png'), render(favicon, 512));
writeFileSync(out('banner.png'), render(banner, 1280));
writeFileSync(out('favicon-32.png'), render(favicon, 32));
writeFileSync(out('og-image.png'), render(og, 1200));
console.log('Assets written to public/.');
