/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],
  plugins: [require('flowbite/plugin')],
  darkMode: 'class',
  theme: {
    colors: {},
    extend: {
      colors: {
        dark: '#1F271B',
        primary: '#19647E',
        info: '#28AFB0',
        warning: '#EE964B',
        yellow: '#F4D35E',
        light: '#F8F9FA',
        white: '#FFFFFF'
      }
    }
  }
}
