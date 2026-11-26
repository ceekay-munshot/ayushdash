/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Rubik', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        buy: '#16a34a',
        neutral: '#6b7280',
        avoid: '#dc2626',
      },
    },
  },
  plugins: [],
};
