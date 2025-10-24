const NAMED_COLOR_MAP = {
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#8b5cf6',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  green: '#10b981',
  lime: '#84cc16',
  yellow: '#eab308',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#f43f5e',
  rose: '#f43f5e',
  pink: '#ec4899',
  brown: '#b45309',
  slate: '#64748b',
  gray: '#6b7280'
};

const HEX_PATTERN = /^#?([a-f0-9]{3}|[a-f0-9]{6})$/i;

const ensureHexHash = (hex) => {
  if (!hex) return '#3b82f6';
  return hex.startsWith('#') ? hex : `#${hex}`;
};

const expandShorthand = (hex) => {
  const match = HEX_PATTERN.exec(hex);
  if (!match) return '#3b82f6';
  const value = match[1];
  if (value.length === 6) {
    return ensureHexHash(value);
  }
  return ensureHexHash(
    value
      .split('')
      .map((ch) => ch + ch)
      .join('')
  );
};

export const normalizeColor = (rawColor) => {
  if (!rawColor) return '#3b82f6';
  const trimmed = `${rawColor}`.trim();

  if (trimmed.startsWith('var(')) {
    const match = /--color-([a-z]+)-/.exec(trimmed);
    if (match && NAMED_COLOR_MAP[match[1]]) {
      return NAMED_COLOR_MAP[match[1]];
    }
  }

  if (HEX_PATTERN.test(trimmed)) {
    return expandShorthand(trimmed);
  }

  const lookupKey = trimmed.toLowerCase();
  if (NAMED_COLOR_MAP[lookupKey]) {
    return NAMED_COLOR_MAP[lookupKey];
  }

  return '#3b82f6';
};

export const hexToRgb = (hex) => {
  const sanitized = normalizeColor(hex).slice(1);
  const value = parseInt(sanitized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const componentToHex = (component) => {
  const clamped = Math.max(0, Math.min(255, Math.round(component)));
  return clamped.toString(16).padStart(2, '0');
};

export const rgbToHex = (r, g, b) =>
  `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;

const mixChannel = (source, target, amount) =>
  Math.round(source + (target - source) * amount);

export const mixHex = (hexA, hexB, amount) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const ratio = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    mixChannel(a.r, b.r, ratio),
    mixChannel(a.g, b.g, ratio),
    mixChannel(a.b, b.b, ratio)
  );
};

export const lightenHex = (hex, amount) => mixHex(hex, '#ffffff', amount);

export const darkenHex = (hex, amount) => mixHex(hex, '#000000', amount);

export const toRgba = (hex, alpha = 1) => {
  const { r, g, b } = hexToRgb(hex);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
};

export const buildEventPalette = ({
  color,
  isPast = false,
  isAllDay = false,
  isCompleted = false
}) => {
  const base = normalizeColor(color);
  const softenedBase = isCompleted ? lightenHex(base, 0.4) : base;

  const backgroundAlphaBase = isAllDay
    ? (isPast ? 0.14 : 0.24)
    : (isPast ? 0.32 : 0.68);
  const backgroundAlpha = isCompleted
    ? backgroundAlphaBase * 0.55
    : backgroundAlphaBase;
  const background = toRgba(softenedBase, backgroundAlpha);

  const borderDarken = isCompleted ? 0.2 : isPast ? 0.32 : 0.45;
  const borderAlpha = isCompleted ? 0.32 : (isPast ? 0.4 : 0.62);
  const border = toRgba(darkenHex(base, borderDarken), borderAlpha);

  const markerDarken = isCompleted ? 0.28 : isPast ? 0.35 : 0.55;
  const markerAlpha = isCompleted ? 0.45 : (isPast ? 0.55 : 0.85);
  const marker = toRgba(darkenHex(base, markerDarken), markerAlpha);

  const primaryDarken = isCompleted ? 0.05 : isPast ? 0.23 : 0.35;
  const primaryAlpha = isCompleted ? 0.62 : (isPast ? 0.74 : 0.92);
  const textPrimary = toRgba(darkenHex(base, primaryDarken), primaryAlpha);

  const secondaryDarken = isCompleted ? 0.08 : isPast ? 0.28 : 0.4;
  const secondaryAlpha = isCompleted ? 0.5 : (isPast ? 0.6 : 0.8);
  const textSecondary = toRgba(darkenHex(base, secondaryDarken), secondaryAlpha);

  const mutedDarken = isCompleted ? 0.12 : isPast ? 0.32 : 0.48;
  const mutedAlpha = isCompleted ? 0.42 : (isPast ? 0.48 : 0.68);
  const mutedText = toRgba(darkenHex(base, mutedDarken), mutedAlpha);

  return {
    base,
    background,
    border,
    marker,
    textPrimary,
    textSecondary,
    mutedText
  };
};

export const isEventInPast = (event) => {
  if (!event) return false;
  const now = Date.now();
  let endBoundary = event?.end;

  if (endBoundary instanceof Date) {
    // already normalized
  } else if (endBoundary && typeof endBoundary === 'object') {
    if (endBoundary.dateTime) {
      endBoundary = new Date(endBoundary.dateTime);
    } else if (endBoundary.date) {
      endBoundary = new Date(`${endBoundary.date}T23:59:59`);
    } else {
      endBoundary = null;
    }
  } else if (endBoundary) {
    endBoundary = new Date(endBoundary);
  }

  if (!endBoundary || Number.isNaN(endBoundary.getTime())) {
    return false;
  }

  return endBoundary.getTime() < now;
};
