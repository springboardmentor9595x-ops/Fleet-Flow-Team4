/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#FFFFFF',
          secondary: '#FFFFFF',
          card: '#FFFFFF',
          border: '#E2E8F0',
        },
        teal: {
          primary: '#0F766E',
          secondary: '#14B8A6',
          accent: '#CCFBF1',
          hover: '#115E59',
          bg: '#F0FDFA',
        },
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
        },
      },
    },
  },
  plugins: [],
};
