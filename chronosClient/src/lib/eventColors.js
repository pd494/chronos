// Standardized event color palette matching the screenshot
// These colors are used consistently across all calendar views

export const EVENT_COLORS = {
  // Light pastel backgrounds with darker text colors
  blue: {
    background: '#C5E0F9',  // Light blue
    text: '#1761C7',        // 5% darker blue for text
    border: '#1761C7'
  },
  orange: {
    background: '#FFDAB3',  // Light peach/orange
    text: '#C65D00',        // Darker orange for text
    border: '#C65D00'
  },
  violet: {
    background: '#E6D4F9',  // Light violet/purple
    text: '#8E24AA',        // Darker purple for text
    border: '#8E24AA'
  },
  pink: {
    background: '#F7C5D9',  // Light pink
    text: '#D81B60',        // Darker pink for text
    border: '#D81B60'
  },
  green: {
    background: '#D4F4DD',  // Light green
    text: '#0B8043',        // Darker green for text
    border: '#0B8043'
  },
  teal: {
    background: '#B8E6E6',  // Light teal/cyan
    text: '#00897B',        // Darker teal for text
    border: '#00897B'
  },
  red: {
    background: '#F7C5C5',  // Light red
    text: '#D50000',        // Darker red for text
    border: '#D50000'
  },
  brown: {
    background: '#E8D6C0',  // Light brown/tan
    text: '#8D6E63',        // Darker brown for text
    border: '#8D6E63'
  },
  yellow: {
    background: '#FDF2A2',  // Light yellow from coolors palette
    text: '#D7C282',        // Darker yellow/gold for text
    border: '#D7C282'
  }
};

// Get colors for an event based on its color property
export const getEventColors = (colorName) => {
  // If it's a hex color, return it as-is for background
  if (colorName && colorName.startsWith('#')) {
    return {
      background: colorName,
      text: darkenHexColor(colorName, 40),
      border: darkenHexColor(colorName, 40)
    };
  }
  
  // Default to blue if color not found
  return EVENT_COLORS[colorName] || EVENT_COLORS.blue;
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
