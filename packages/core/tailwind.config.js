/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}', './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}'],
  plugins: [require('flowbite/plugin')],
  darkMode: 'class',
  theme: {
    colors: {},
    borderRadius: 0,
    extend: {
      colors: {
        dark: '#1F271B',
        primary: '#19647E',
        info: '#28AFB0',
        warning: '#EE964B',
        yellow: '#F4D35E',
        light: '#F8F9FA',
        white: '#FFFFFF',
        'dark-body': '#2D2D2D',
        'dark-primary': '#114955',
        'dark-info': '#1C6F73',
        'dark-warning': '#BA6B2F',
        'dark-yellow': '#BAA82F',
        'dark-light': '#2F302B'
      }
    }
  }
}
