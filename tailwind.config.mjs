/**
 * Tailwind v4 lee este archivo desde src/styles/global.css (@config).
 * Los 4 vientos son colores nativos: bg-mistral, text-austro-claro, border-cierzo…
 * Fuente de verdad: identidad del promo (video-feria-4-vientos.html).
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/**/*.{astro,html,js,ts,md}'],
  theme: {
    extend: {
      colors: {
        crema: '#FFF7EA',
        tinta: { DEFAULT: '#1A1633', suave: '#6B6880' },
        mistral: { DEFAULT: '#1E9C8C', claro: '#BFF0E6', medio: '#7FD6C8' },
        gregal: { DEFAULT: '#E8641B', claro: '#FFE1C7', medio: '#F6A56F' },
        austro: { DEFAULT: '#E3287A', claro: '#FFD3E6', medio: '#F287B6' },
        cierzo: { DEFAULT: '#7B3FE4', claro: '#E1D4FF', medio: '#B394F2' },
        whatsapp: '#25D366',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Manrope', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        body: ['Manrope', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grad-juancode': 'linear-gradient(120deg, #06B6D4 0%, #D946EF 55%, #8B5CF6 100%)',
        'grad-vientos': 'linear-gradient(120deg, #1E9C8C 0%, #E8641B 35%, #E3287A 68%, #7B3FE4 100%)',
      },
    },
  },
};
