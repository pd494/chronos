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
          '0%': {
            transform: 'scale(0.35) translateY(-14px) rotate(-2deg)',
            opacity: '0',
            boxShadow: '0 0 0 rgba(0,0,0,0)'
          },
          '25%': {
            transform: 'scale(1.28) translateY(8px) rotate(1deg)',
            opacity: '1',
            boxShadow: '0 18px 45px rgba(0,0,0,0.22)'
          },
          '45%': {
            transform: 'scale(0.9) translateY(-4px)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)'
          },
          '65%': {
            transform: 'scale(1.14) translateY(0px)',
            boxShadow: '0 14px 34px rgba(0,0,0,0.2)'
          },
          '82%': {
            transform: 'scale(0.98) translateY(0px)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.16)'
          },
          '100%': {
            transform: 'scale(1) translateY(0)',
            opacity: '1',
            boxShadow: '0 6px 14px rgba(0,0,0,0.12)'
          },
        },
      },
      animation: {
        'month-cell-pulse': 'monthCellPulse 0.8s ease-in-out infinite alternate',
        'day-cell-pulse': 'dayCellPulse 0.8s ease-in-out infinite alternate',
        'event-drop-pop': 'eventDropPop 0.65s cubic-bezier(0.2, 0.9, 0.3, 1.5)',
      },
    },
  },
  plugins: [],
}
