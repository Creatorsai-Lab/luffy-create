/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        editor: {
          bg:           '#0f0f0f',
          panel:        '#1a1a1a',
          'elevated-highlight':'#1e1e1e',
          border:       '#3a3a3a',
          'border-strong': '#404040',
          'text-secondary': '#737373',
          text:         '#e5e5e5',
          accent:       '#6a32c9',
          'accent-hover': '#6028c0',
          'accent-dim': '#9563f126',
          success:      '#22c55e',
          warning:      '#f59e0b',
          error:        '#ef4444',
        }
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs:    ['11px', '16px'],
        sm:    ['12px', '18px'],
        base:  ['13px', '20px'],
      }
    }
  },
  plugins: []
}
