/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#3D5C5C',
          'teal-dk': '#2B3D3D',
          brown: '#8B7355',
          orange: '#D4792C',
          cream: '#F5F2EE',
          black: '#1A1A1A',
          gray100: '#F7F7F5',
          gray200: '#ECEAE6',
          gray300: '#D5D2CC',
          gray400: '#A09A90',
          gray500: '#6E685E',
        },
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'text-primary': 'var(--color-text)',
        'text-secondary': 'var(--color-text-sec)',
        'border-subtle': 'var(--color-border)',
        accent: 'var(--color-accent)',
        sidebar: 'var(--color-sidebar)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-sans)'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
