import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // O Three.js sozinho passa de 500 kB; o aviso padrão não ajuda aqui.
    chunkSizeWarningLimit: 800,
  },
});
