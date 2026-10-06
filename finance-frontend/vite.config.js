import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The Modal and the list hooks manipulate document.body and the document
    // keydown bus, so they need a DOM rather than the default node env.
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})