import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#060913',
          900: '#0B1020',
          800: '#131A2E',
          700: '#1A233D',
          600: '#232D48',
          500: '#313D5E',
        },
        indigo: {
          DEFAULT: '#6366F1',
          hover: '#4F46E5',
          glow: 'rgba(99, 102, 241, 0.25)',
        },
        cyan: {
          DEFAULT: '#22D3EE',
          glow: 'rgba(34, 211, 238, 0.25)',
        },
        emerald: {
          DEFAULT: '#22C55E',
        },
        amber: {
          DEFAULT: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Space Grotesk', 'sans-serif'],
        code: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
