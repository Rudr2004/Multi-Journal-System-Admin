const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: v('page'),
        surface: v('surface'),
        subtle: v('subtle'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), soft: v('accent-soft') },
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      fontSize: { xs: ['12px', '16px'], sm: ['13px', '20px'], base: ['14px', '22px'] },
      borderRadius: { DEFAULT: '8px', lg: '8px', md: '6px' },
      boxShadow: { overlay: '0 8px 24px -4px rgb(15 23 42 / 0.12), 0 2px 6px -2px rgb(15 23 42 / 0.08)' },
    },
  },
  plugins: [],
}
