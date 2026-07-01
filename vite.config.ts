import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: true,
    port: 5178,
    allowedHosts: ['.ts.net', 'localhost', '127.0.0.1'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['app-icon.svg'],
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'Anecdotia',
        short_name: 'Anecdotia',
        description:
          'Mini anecdotario familiar privado para capturar recuerdos en pocos minutos.',
        start_url: '/obrach',
        scope: '/',
        display: 'standalone',
        background_color: '#f6faf7',
        theme_color: '#21483f',
        orientation: 'any',
        icons: [
          {
            src: '/app-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
});
