import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite copies everything under public/ (including public/data/*.json) into
// dist/ at build time, so the committed data files ship with the static site.
export default defineConfig({
  plugins: [react()],
});
