/** Company themes: colours, logo and copy used by the login page, the learning environment, certificates and emails. */

export const DEFAULT_THEME = {
  portalName: 'Fit2Trade Learn',
  companyName: 'Fit2Trade Ltd',
  tagline: 'making workplaces better',
  logoUrl: '/brand/fit2trade-logo.png',
  logoBackground: '#ffffff',
  faviconUrl: '/brand/fit2trade-logo.png',
  primary: '#275c4d',
  accent: '#3f8a73',
  ink: '#3b3a3a',
  background: '#f4f6f5',
  sidebar: 'light',            // light | dark
  font: 'Inter',
  loginHeadline: 'Learning, safety and compliance in one connected platform.',
  loginSubtext: 'Self-paced courses, live virtual classrooms and audit-ready records.',
  loginBackground: 'gradient', // gradient | solid | image
  loginImageUrl: '',
  footerText: '',
  website: 'https://www.fit2trade.com',
  supportEmail: '',
  customCss: '',
};

/** Ready-made themes for the group companies. Colours are sampled from the official logos. */
export const PRESETS = {
  fit2trade: { ...DEFAULT_THEME },
  eazysafe: {
    ...DEFAULT_THEME,
    portalName: 'EazySAFE Learning', companyName: 'EazySAFE Ltd', tagline: 'Environmental, Health & Safety training made easy',
    logoUrl: '/brand/eazysafe-logo.png', faviconUrl: '/brand/eazysafe-icon.png',
    primary: '#e8002a', accent: '#52555b', ink: '#2f3135', background: '#f6f6f7', sidebar: 'dark',
    loginHeadline: 'EHS training your people will actually complete.',
    loginSubtext: 'Contractor inductions, manual handling, fire safety and more – tracked, certified and audit-ready.',
    website: 'https://www.eazysafe.com', supportEmail: 'support@eazysafe.com',
  },
  iact: {
    ...DEFAULT_THEME,
    portalName: 'IACT Academy', companyName: 'IACT', tagline: 'The complete IT training provider',
    logoUrl: '/brand/iact-logo.png', faviconUrl: '/brand/iact-logo.png',
    primary: '#2f2c7b', accent: '#9795bd', ink: '#2b2a3a', background: '#f4f4f8', sidebar: 'light',
    loginHeadline: 'Build the IT skills your organisation needs.',
    loginSubtext: 'Microsoft 365, Azure, Adobe, project management and professional skills – online, live and in the classroom.',
    website: 'https://www.iact.ie', supportEmail: 'info@iact.ie',
  },
};

export function resolveTheme(company) {
  let stored = {};
  try { stored = JSON.parse(company?.theme_json || '{}'); } catch {}
  const base = PRESETS[stored.preset] || DEFAULT_THEME;
  const theme = { ...base, ...Object.fromEntries(Object.entries(stored).filter(([k, v]) => k !== 'preset' && v !== '' && v != null)) };
  if (company?.name && !stored.companyName && !PRESETS[stored.preset]) theme.companyName = company.name;
  if (company?.website && !stored.website) theme.website = company.website;
  return { ...theme, shades: shades(theme.primary) };
}

/** Derive the tints/shades the stylesheet needs from one primary colour. */
export function shades(hex) {
  const [r, g, b] = toRgb(hex);
  const mix = (t, w) => `#${[r, g, b].map((c) => Math.round(c + (t - c) * w).toString(16).padStart(2, '0')).join('')}`;
  return { 600: mix(0, 0.18), 700: mix(0, 0.35), 100: mix(255, 0.86), 50: mix(255, 0.94), text: luminance(r, g, b) > 0.5 ? '#1f1f1f' : '#ffffff' };
}
function toRgb(hex) { const h = String(hex || '#275c4d').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function luminance(r, g, b) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }

export const THEME_FIELDS = Object.keys(DEFAULT_THEME);
export function sanitiseTheme(input = {}) {
  const out = {};
  if (input.preset && PRESETS[input.preset]) out.preset = input.preset;
  for (const k of THEME_FIELDS) if (input[k] !== undefined && input[k] !== null) out[k] = String(input[k]).slice(0, k === 'customCss' ? 20000 : 500);
  for (const k of ['primary', 'accent', 'ink', 'background', 'logoBackground']) if (out[k] && !/^#[0-9a-f]{3,8}$/i.test(out[k])) delete out[k];
  return out;
}
