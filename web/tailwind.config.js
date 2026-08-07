/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink)',
        'green-dk': 'var(--color-green-dk)',
        green: 'var(--color-green)',
        brown: 'var(--color-brown)',
        'brown-dk': 'var(--color-brown-dk)',
        orange: 'var(--color-orange)',
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'text-primary': 'var(--color-text)',
        'text-secondary': 'var(--color-text-sec)',
        'border-subtle': 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-2': 'var(--color-accent-2)',
        'accent-3': 'var(--color-accent-3)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        display: ['var(--font-display)'],
      },
    },
  },
  plugins: [],
}
