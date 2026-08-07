/** @type {import('tailwindcss').Config} */

// Tailwind v3 can't inject an alpha modifier (e.g. bg-green/15) into an
// opaque var() color value. Wrapping the color in a function that receives
// { opacityValue } lets Tailwind hand us the modifier so we can build the
// final color with color-mix() instead. Without opacityValue, we fall back
// to the plain var() so unmodified classes (bg-green, text-ink, ...) are
// unaffected.
const withAlpha = (cssVar) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(${cssVar})`
    : `color-mix(in srgb, var(${cssVar}) calc(${opacityValue} * 100%), transparent)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: withAlpha('--color-ink'),
        'state-danger': withAlpha('--state-danger'),
        'state-success': withAlpha('--state-success'),
        'green-dk': withAlpha('--color-green-dk'),
        green: withAlpha('--color-green'),
        brown: withAlpha('--color-brown'),
        'brown-dk': withAlpha('--color-brown-dk'),
        orange: withAlpha('--color-orange'),
        bg: withAlpha('--color-bg'),
        surface: withAlpha('--color-surface'),
        'surface-alt': withAlpha('--color-surface-alt'),
        'text-primary': withAlpha('--color-text'),
        'text-secondary': withAlpha('--color-text-sec'),
        'border-subtle': withAlpha('--color-border'),
        accent: withAlpha('--color-accent'),
        'accent-3': withAlpha('--color-accent-3'),
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
