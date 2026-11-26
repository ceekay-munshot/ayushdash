/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral + primary chrome. The copied fdc kit references `fdc-*`
        // tokens; we keep the names but repoint the "green" primary family to
        // our indigo brand accent and the neutrals to slate tints, so the kit
        // adopts our look with almost no edits.
        fdc: {
          green: '#6366F1', // primary accent -> indigo
          'green-light': '#818CF8',
          'green-lighter': '#A5B4FC',
          'green-dark': '#4338CA', // strong (table header)
          gold: '#F59E0B',
          'gold-light': '#FBBF24',
          'gold-dark': '#D97706',
          orange: '#F97316',
          red: '#F43F5E',
          blue: '#3B82F6',
          ink: '#0F172A', // slate-900
          slate: '#334155', // slate-700
          grey: '#64748B', // slate-500
          light: '#CBD5E1', // slate-300
          offwhite: '#F1F5F9', // slate-100
          'offwhite-2': '#E2E8F0',
          'row-odd': '#F8FAFC',
          'row-even': '#FFFFFF',
        },
        // Brand accent gradient (hero / header).
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          indigo: '#6366F1',
          violet: '#8B5CF6',
          pink: '#EC4899',
          600: '#4F46E5',
          700: '#4338CA',
        },
        // Verdict semantics — used everywhere a bucket appears.
        verdict: {
          buy: '#10B981', // emerald
          'buy-dark': '#059669',
          neutral: '#F59E0B', // amber
          'neutral-dark': '#D97706',
          avoid: '#F43F5E', // rose
          'avoid-dark': '#E11D48',
        },
      },
      fontFamily: {
        sans: ['Rubik', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)',
        'card-hover': '0 2px 4px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.10)',
        pop: '0 8px 28px rgba(15,23,42,0.18)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
