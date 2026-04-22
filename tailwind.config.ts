import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Segoe UI',
          'Calibri',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          'Arial',
          'sans-serif',
        ],
        mono: ['Consolas', 'Courier New', 'monospace'],
      },
      colors: {
        osk: {
          DEFAULT: '#980234',
          50: '#fff1f4',
          100: '#ffe1e7',
          200: '#ffc4d0',
          300: '#ff91a8',
          400: '#fb5278',
          500: '#b5034a',
          600: '#980234',
          700: '#7d022b',
          800: '#5c0120',
          900: '#3c0215',
        },
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 2px 8px -2px rgb(0 0 0 / 0.06)',
        pop: '0 10px 40px -10px rgb(0 0 0 / 0.25)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'overlay-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'dialog-in': {
          '0%': {
            opacity: '0',
            transform: 'translate(-50%, -48%) scale(0.97)',
          },
          '100%': {
            opacity: '1',
            transform: 'translate(-50%, -50%) scale(1)',
          },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'overlay-in': 'overlay-in 150ms ease-out',
        'dialog-in': 'dialog-in 150ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
