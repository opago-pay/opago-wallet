import { colorModePreference, type ColorMode } from './color-mode';

// Explicit roles preserve the original dark design while assigning known
// screen colors a deliberate light counterpart. No arbitrary RGB conversion.
export const themePalette = {
  dark: {
    canvas: '#0a0a0c', surface: '#1b1b20', raised: '#242427', selected: '#3a301c',
    text: '#ffffff', secondary: '#aaaab3', muted: '#92929e',
    accentText: '#ffb000', accentFill: '#ffb000', onAccent: '#15150e',
    successText: '#49d17d', errorText: '#ffab97', warningText: '#ffce6b',
    testnetText: '#b7a8ff',
    testnetSurface: '#211c36',
    successSurface: '#132820', warningSurface: '#282113',
    border: '#39393e', strongBorder: '#64646b',
  },
  light: {
    canvas: '#ffffff', surface: '#f4f4f6', raised: '#e9e9ed', selected: '#fff0c2',
    text: '#18181d', secondary: '#4c4c55', muted: '#60606a',
    accentText: '#775000', accentFill: '#ffb000', onAccent: '#15150e',
    successText: '#176b49', errorText: '#a33d32', warningText: '#805300',
    testnetText: '#6541a0',
    testnetSurface: '#f0ebfa',
    successSurface: '#e6f6ee', warningSurface: '#fff5df',
    border: '#d2d2d9', strongBorder: '#888891',
  },
} as const;

export type ThemeColorRole = keyof typeof themePalette.dark;

export function themeColor(role: ThemeColorRole, mode: ColorMode = colorModePreference.getSnapshot().mode): string {
  return themePalette[mode][role];
}

type ColorProperty = 'color' | 'backgroundColor' | 'borderColor' | 'borderTopColor' | 'borderBottomColor' | 'borderLeftColor' | 'borderRightColor';
type Assignments = Partial<Record<ThemeColorRole, readonly string[]>>;

const textAssignments: Assignments = {
  onAccent: ['#101011', '#111', '#141008', '#15150e'],
  text: [
    '#ceced4', '#d0cfd1', '#d3d3da', '#d4d4da', '#d5d5da', '#d5d5dc', '#d8d8dc', '#e0e3d8', '#e6e8de',
    '#eeeef0', '#eeeef1', '#f0f2e8', '#f3f4eb', '#f6f3e9', '#f7f7f7', '#f7f7fa', '#f8f8fa',
    '#f9f9fa', '#fafaf7', '#fff', '#ffffff',
  ],
  secondary: [
    '#a1a296', '#a3a3ad', '#a3a69a', '#a3a99a', '#a59a84', '#a5a5af', '#a5ae9a',
    '#a0a0ab', '#a5a5b1', '#a6a6ad', '#a9a9b0', '#a9a9b1', '#a9a9b2', '#aaaab0', '#aaaab3', '#aaaab4', '#aab29f', '#b0b4a7', '#b3b3bb', '#b5b5bd', '#b5b5bf',
    '#b6b6be', '#b6b6c0', '#b7b7be', '#b7b7c0', '#b8b8c0', '#b8b8c2', '#c1c6b7', '#c3c3ca', '#c8c8ce',
  ],
  muted: [
    '#505053', '#5f5f6b', '#666', '#666670', '#666673', '#696971', '#696d60', '#777', '#777780', '#777783', '#787884', '#7f7f8b', '#81818d',
    '#85858f', '#888f7f', '#888893', '#898994', '#8f8f9d', '#919987', '#92929e', '#929788', '#92988b', '#96969d', '#969987', '#9696a2', '#696974',
    '#979f8d', '#999d91', '#9b9ba5', '#9b9ba7', '#9ca18f',
  ],
  accentText: ['#ffb000', 'rgba(255,176,0,0.16)', 'rgba(255,176,0,0.18)', '#d3a25d'],
  successText: ['#49d17d', '#75d3af', '#87ddbd', '#8de4bd', '#91dbaa'],
  errorText: ['#ff6666', '#ffab97', '#ffc1ac'],
  warningText: ['#c3a06d', '#f0a66b', '#f2b45d', '#f4d38a', '#ffca54', '#ffce6b', '#e6ddc8', '#ffe2a3'],
  testnetText: ['#b7a8ff', '#c9c0ff'],
};

const backgroundAssignments: Assignments = {
  canvas: ['#09090b', '#0a0a0c', '#0c0e0b', '#101012'],
  surface: [
    '#121216', '#141416', '#151518', '#151519', '#161619', '#16161a', '#161a13',
    '#171719', '#17171b', '#17171c', '#1b1b20', '#1b2017', '#1d190f',
  ],
  raised: [
    '#202023', '#202024', '#222225', '#222227', '#242427', '#242428', '#252527',
    '#262629', '#2d3326', '#303034', '#505053',
  ],
  selected: ['#3a301c', '#242018', '#292414', '#2a2924', '#30302a'],
  successSurface: ['#132820'],
  warningSurface: ['#211b0f', '#211c11', '#27231a', '#282113'],
  accentFill: ['#ffb000'],
};

const borderAssignments: Assignments = {
  border: [
    '#28282c', '#2c2c31', '#2d2d31', '#2d3426', '#303038', '#30342b', '#30382a',
    '#2d2d35', '#303035', '#33333a', '#33333d', '#39393e', '#3b4331', '#3c3c46', '#44444a', '#46464c', '#48484f', '#4c3535', '#54545e',
    '#292d23', '#2b3025',
  ],
  strongBorder: ['#64646b', '#64646c', '#66501d', '#6b541b', '#96701c', '#a88837'],
  accentText: ['#ffb000'],
  successText: ['#8de4bd'],
  errorText: ['#ea9681'],
};

function roleMap(assignments: Assignments): ReadonlyMap<string, ThemeColorRole> {
  const entries = new Map<string, ThemeColorRole>();
  for (const [role, colors] of Object.entries(assignments) as [ThemeColorRole, readonly string[]][]) {
    for (const color of colors) {
      if (entries.has(color)) throw new Error(`Duplicate theme assignment: ${color}`);
      entries.set(color, role);
    }
  }
  return entries;
}

const textRoles = roleMap(textAssignments);
const backgroundRoles = roleMap(backgroundAssignments);
const borderRoles = roleMap(borderAssignments);

const specialLightColors: Partial<Record<ColorProperty, Readonly<Record<string, string>>>> = {
  backgroundColor: {
    '#000b': '#000b', '#09090b91': '#09090b91', '#151517ed': '#ffffffed',
    '#87ddbd08': '#e6f6ee', '#ffb00008': '#fff8e8', '#ffffff13': '#0000000a',
    '#fff': '#fff', '#8de4bd': '#c8efde',
    '#2a2a31': '#d2d2d9',
    'rgba(107,92,195,0.14)': '#f0ebfa', 'rgba(107,92,195,0.16)': '#f0ebfa',
    'rgba(255,176,0,0.08)': '#fff5df', 'rgba(255,176,0,0.09)': '#fff5df',
    'rgba(255,176,0,0.14)': '#fff0c2',
    'rgba(73,209,125,0.1)': '#e6f6ee', 'rgba(73,209,125,0.16)': '#e6f6ee',
    'rgba(0,0,0,0.85)': 'rgba(0,0,0,0.85)',
    'rgba(242,180,93,0.08)': '#fff5df',
    'rgba(255,102,102,0.14)': '#fff0ec',
    'rgba(255,176,0,0.12)': '#fff4d8',
    'rgba(255,255,255,0.07)': 'rgba(0,0,0,0.04)',
    'rgba(32,32,34,0.92)': 'rgba(244,244,246,0.94)',
    'rgba(37,37,39,0.82)': 'rgba(244,244,246,0.86)',
    'rgba(73,209,125,0.12)': '#e6f6ee',
  },
  borderColor: {
    '#87ddbd10': '#b9dccb', '#87ddbd38': '#a6d4bc', '#ffb0000e': '#e9d5a4',
    '#ffb00016': '#dcc18a', '#ffffff13': '#d2d2d9', '#ffffff14': '#d2d2d9',
    'rgba(255,255,255,0.08)': '#d2d2d9', 'rgba(255,255,255,0.10)': '#d2d2d9',
    'rgba(255,255,255,0.09)': '#d2d2d9', 'rgba(255,255,255,0.12)': '#d2d2d9',
    'rgba(255,255,255,0.14)': '#d2d2d9', 'rgba(107,92,195,0.5)': '#a48acb',
  },
  borderTopColor: {
    '#87ddbd38': '#a6d4bc', '#ffffff1c': '#d2d2d9',
  },
  borderRightColor: {
    '#ffb00070': '#775000', '#87ddbd38': '#6b9e82',
  },
};

/** Exact known assignments only. Unknown brand and QR colors are never guessed. */
export function adaptColor(value: string, property: string): string {
  if (colorModePreference.getSnapshot().mode !== 'light') return value;
  const key = value.toLowerCase();
  const special = specialLightColors[property as ColorProperty]?.[key];
  if (special) return special;
  const roles = property === 'color' ? textRoles : property === 'backgroundColor'
    ? backgroundRoles : property === 'borderColor' || property === 'borderTopColor' || property === 'borderBottomColor' || property === 'borderLeftColor' || property === 'borderRightColor'
      ? borderRoles : null;
  const role = roles?.get(key);
  return role ? themeColor(role, 'light') : value;
}

export function hasExplicitThemeColor(value: string, property: string): boolean {
  const key = value.toLowerCase();
  if (specialLightColors[property as ColorProperty]?.[key]) return true;
  if (property === 'color') return textRoles.has(key);
  if (property === 'backgroundColor') return backgroundRoles.has(key);
  if (property === 'borderColor' || property === 'borderTopColor' || property === 'borderBottomColor' || property === 'borderLeftColor' || property === 'borderRightColor') return borderRoles.has(key);
  return false;
}

export function adaptiveStyles<T extends Record<string, object>>(styles: T): T {
  const light = new Map<string, object>();
  return new Proxy(styles, {
    get(target, key, receiver) {
      const original = Reflect.get(target, key, receiver);
      if (typeof key !== 'string' || !original || typeof original !== 'object' ||
          colorModePreference.getSnapshot().mode !== 'light') return original;
      let adapted = light.get(key);
      if (!adapted) {
        adapted = Object.fromEntries(Object.entries(original).map(([property, value]) =>
          [property, typeof value === 'string' ? adaptColor(value, property) : value]));
        light.set(key, adapted);
      }
      return adapted;
    },
  });
}
