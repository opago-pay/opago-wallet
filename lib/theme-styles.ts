import { colorModePreference } from './color-mode';

function rgb(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].split('').map(char => char + char).join('') : match[1];
  return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

export function adaptColor(value: string, property: string): string {
  if (colorModePreference.getSnapshot().mode !== 'light') return value;
  if (property === 'backgroundColor' && value.startsWith('rgba(255,255,255,')) {
    return value.replace('rgba(255,255,255,', 'rgba(0,0,0,');
  }
  if (property === 'borderColor' || property === 'borderTopColor' || property === 'borderBottomColor') {
    if (value.startsWith('rgba(255,255,255,')) return value.replace('rgba(255,255,255,', 'rgba(0,0,0,');
  }
  const channels = rgb(value);
  if (!channels) return value;
  const [red, green, blue] = channels;
  const min = Math.min(...channels);
  const max = Math.max(...channels);
  const neutral = max - min < 28;
  const brightness = (red + green + blue) / 3;
  if (property === 'backgroundColor') {
    if (neutral && brightness < 20) return '#ffffff';
    if (neutral && brightness < 50) return '#f4f4f6';
    if (neutral && brightness < 100) return '#e9e9ed';
    if (brightness < 55 && red > green && green > blue) return '#fff5df';
    return value;
  }
  if (property === 'borderColor' || property === 'borderTopColor' || property === 'borderBottomColor') {
    if (neutral && brightness < 110) return '#d9d9df';
    return value;
  }
  if (property === 'color') {
    if (neutral && brightness > 220) return '#18181d';
    if (neutral && brightness > 170) return '#4c4c55';
    if (neutral && brightness > 105) return '#60606a';
    if (red > green + 35 && red > blue + 25 && green < 195 && blue > green * 0.75) return '#a33d32';
    if (red > 180 && green > 100 && blue < 180) return '#8b5b00';
    if (green > red + 30 && green > blue + 12) return '#18764d';
  }
  return value;
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
