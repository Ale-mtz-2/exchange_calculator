/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#182f50',
        coral: '#3b8fd4',
        moss: '#1a5276',
        sand: '#eef7ff',
        skyline: '#dff1ff',
        cloud: '#f7fbff',
        navy: '#182f50',
        sky: '#67b6df',
        'sky-light': '#6bb7e1',
        accent: '#2e86c1',
        'accent-light': '#85c1e9',
      },
      fontFamily: {
        sans: ['Sora', 'Manrope', 'ui-sans-serif', 'system-ui'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
