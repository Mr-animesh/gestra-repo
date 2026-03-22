/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0a0a0f',
                card: '#12121a',
                accent: '#6c63ff'
            },
            fontFamily: {
                sans: ['Inter', 'Geist', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
