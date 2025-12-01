// Standardized event color palette matching the screenshot
// These colors are used consistently across all calendar views

// ============================================================
// EDIT THESE TO CHANGE EVENT COLORS IN DAY/WEEK VIEW
// background = block fill color
// border = vertical line on left
// text = title color
// ============================================================
export const EVENT_COLORS = {
  blue:   { background: '#C5E0F9', border: '#1761C7', text: '#1761C7' },
  violet: { background: '#D3D3FF', border: '#7A3EC8', text: '#8B4DE8' },
  red:    { background: '#f67f9cff', border: '#D50000', text: '#7A0000' },
  yellow: { background: '#FFFFC5', border: '#DAA520', text: '#B38314' },
  green:  { background: '#D4F4DD', border: '#0B8043', text: '#0B8043' },
  teal:   { background: '#B8E6E6', border: '#00897B', text: '#00897B' },
  orange: { background: '#FFDAB3', border: '#C65D00', text: '#C65D00' },
  pink:   { background: '#F7C5D9', border: '#D81B60', text: '#f2f2f2ffff' },
  brown:  { background: '#E8D6C0', border: '#8D6E63', text: '#8D6E63' }
};

// Map Google Calendar hex codes to our palette names
const HEX_TO_PALETTE = {
  // Blues
  '#1761c7': 'blue',
  '#4285f4': 'blue',
  '#1a73e8': 'blue',
  '#3b82f6': 'blue',
  '#4d90fe': 'blue',
  '#3973e7': 'blue',
  '#039be5': 'blue',
  '#7986cb': 'blue',
  
  // Greens
  '#0b8043': 'green',
  '#33b679': 'green',
  '#009688': 'green',
  '#7cb342': 'green',
  
  // Teals/Cyans
  '#00897b': 'teal',
  '#009688': 'teal',
  '#0097a7': 'teal',
  '#00acc1': 'teal',
  
  // Reds
  '#d50000': 'red',
  '#e67c73': 'red',
  '#f4511e': 'red',
  '#dc2626': 'brown',
  
  // Oranges
  '#f4511e': 'orange',
  '#e65100': 'orange',
  '#ef6c00': 'orange',
  '#f09300': 'orange',
  '#ff8f00': 'orange',
  
  // Yellows
  '#f6bf26': 'yellow',
  '#fdd835': 'yellow',
  '#ffb300': 'yellow',
  '#c0ca33': 'yellow',
  
  // Pinks
  '#d81b60': 'pink',
  '#e91e63': 'pink',
  '#ad1457': 'pink',
  '#f06292': 'pink',
  
  // Violets/Purples
  '#8e24aa': 'violet',
  '#7986cb': 'violet',
  '#9e69af': 'violet',
  '#b39ddb': 'violet',
  '#673ab7': 'violet',
  '#9c27b0': 'violet',
  '#a855f7': 'violet',
  '#9333ea': 'violet',
  '#7c3aed': 'violet',
  '#8b5cf6': 'violet',
  '#a78bfa': 'violet',
  '#c084fc': 'violet',
  
  // Browns
  '#795548': 'brown',
  '#8d6e63': 'brown',
  '#a1887f': 'brown',
  '#616161': 'brown'
};

// Detect closest palette color from a hex by hue
const detectPaletteFromHex = (hex) => {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.substring(0, 2), 16)
  const g = parseInt(normalized.substring(2, 4), 16)
  const b = parseInt(normalized.substring(4, 6), 16)
  
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2 / 255
  
  if (max === min) return 'brown' // grayscale
  
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  
  const hue = h * 360
  
  // Map hue ranges to palette names
  if (hue < 15 || hue >= 345) return 'red'
  if (hue < 45) return 'orange'
  if (hue < 70) return 'yellow'
  if (hue < 170) return 'green'
  if (hue < 200) return 'teal'
  if (hue < 260) return 'blue'
  if (hue < 290) return 'violet'
  if (hue < 345) return 'pink'
  return 'blue'
}

export const normalizeToPaletteColor = (colorName = 'blue') => {
  if (!colorName) return 'blue'
  const lower = String(colorName).toLowerCase()
  if (EVENT_COLORS[lower]) return lower
  if (lower === 'purple') return 'violet'
  if (lower.startsWith('#')) {
    const mapped = HEX_TO_PALETTE[lower]
    if (mapped && EVENT_COLORS[mapped]) return mapped
    const detected = detectPaletteFromHex(lower)
    return EVENT_COLORS[detected] ? detected : 'blue'
  }
  return 'blue'
}

// Get colors for an event based on its color property
export const getEventColors = (colorName) => {
  if (colorName && typeof colorName === 'string') {
    const lower = colorName.toLowerCase()
    
    // Check if this hex maps to a palette color
    if (lower.startsWith('#')) {
      const paletteName = HEX_TO_PALETTE[lower]
      if (paletteName && EVENT_COLORS[paletteName]) {
        return EVENT_COLORS[paletteName]
      }
      // Unknown hex - detect closest palette color by hue
      const detected = detectPaletteFromHex(lower)
      return EVENT_COLORS[detected] || EVENT_COLORS.blue
    }
    
    // Check if it's already a palette name
    if (EVENT_COLORS[lower]) {
      return EVENT_COLORS[lower]
    }
  }
  
  // Default to blue if color not found
  return EVENT_COLORS.blue;
};

// Helper function to darken hex colors for custom colors
const darkenHexColor = (hex, percent = 40) => {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const darkenedR = Math.floor(r * (1 - percent / 100));
  const darkenedG = Math.floor(g * (1 - percent / 100));
  const darkenedB = Math.floor(b * (1 - percent / 100));
  return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
};
