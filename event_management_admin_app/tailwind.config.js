/** @type {import('tailwindcss').Config} */
module.exports = {
  // This line is crucial - it tells Tailwind to scan your React files
  content: [
    "./src/renderer/**/*.{js,jsx,ts,tsx}", 
  ],
  theme: {
    extend: {
      // Define your color palette here, matching the example UI
      colors: {
        'primary': {
          DEFAULT: '#7367f0', // The main purple color
          'light': '#a8a2f5',
        },
        'secondary': '#82868b',
        'background': '#f8f7fa',
        'surface': '#ffffff', // For cards and other white backgrounds
      },
      fontFamily: {
        // You can set a clean, modern font like 'Inter'
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 10px 0 rgba(58, 53, 65, 0.1)',
      }
    },
  },
  plugins: [],
}