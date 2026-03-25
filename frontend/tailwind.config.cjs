/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        primaryDark: 'var(--color-primaryDark)',
        primaryLight: 'var(--color-primaryLight)',
        accent: 'var(--color-accent)',
        background: 'var(--color-background)',
        text: 'var(--color-text)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        border: 'var(--color-border)',
        hover: 'var(--color-hover)'
        ,
        surface: 'var(--color-surface)',
        surface2: 'var(--color-surface2)'
      },
      borderRadius: {
        md: '8px',
        lg: '12px'
      },
      boxShadow: {
        panel: '0 4px 6px -1px var(--shadow-panel)',
        modal: '0 8px 32px var(--shadow-modal)'
      },
      fontSize: {
        xs: ['12px', '18px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        lg: ['16px', '24px'],
        xl: ['20px', '28px']
      }
    }
  },
  plugins: []
}
