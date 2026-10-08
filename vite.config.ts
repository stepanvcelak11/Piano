import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages, Netlify, S3 …).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: ['es2020', 'safari14'],
    chunkSizeWarningLimit: 1200,
  },
});
