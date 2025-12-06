import defaultTheme from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      keyframes: {
        monthCellPulse: {
          from: { backgroundColor: 'rgba(59, 130, 246, 0.10)' },
          to: { backgroundColor: 'rgba(59, 130, 246, 0.25)' },
        },
        dayCellPulse: {
          from: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
          to: { backgroundColor: 'rgba(59, 130, 246, 0.35)' },
        },
        eventDropPop: {
          '0%': { transform: 'scale(0.3) translateY(-8px)', opacity: '0' },
          '40%': { transform: 'scale(1.12) translateY(2px)', opacity: '1' },
          '60%': { transform: 'scale(0.92) translateY(-1px)' },
          '80%': { transform: 'scale(1.04) translateY(0)' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'month-cell-pulse': 'monthCellPulse 0.8s ease-in-out infinite alternate',
        'day-cell-pulse': 'dayCellPulse 0.8s ease-in-out infinite alternate',
        'event-drop-pop': 'eventDropPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
  plugins: [],
}