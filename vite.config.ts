import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Lolosin',
        short_name: 'Lolosin',
        description:
          'Belajar CPNS jadi menyenangkan: materi, latihan, dan tryout SKD dalam satu aplikasi.',
        lang: 'id',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: '#0E5C43',
        background_color: '#FAF7F2',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache app shell + seluruh aset build, termasuk chunk bank soal.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Bank soal (~2,5 MB) dibundel jadi satu chunk; naikkan batas
        // default workbox (2 MB) agar chunk itu ikut ter-precache.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // Chunk bank soal memang besar (~7,3 MB); bukan masalah untuk PWA
    // offline-first, tapi jangan sampai peringatan menenggelamkan log.
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Pisahkan bank soal ke chunk sendiri agar cache-nya terpisah
          // dari kode aplikasi dan hanya berubah saat datanya berubah.
          if (id.includes('/data/questions/') && id.endsWith('.json'))
            return 'questions'
          return undefined
        },
      },
    },
  },
})
