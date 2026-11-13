import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// Base path diputuskan dari env saat build, supaya satu repo bisa
// dipakai di dua hosting:
// - Netlify / root domain: default '/', tanpa perlu set apa-apa.
// - GitHub Pages project site (https://dhindatsamara.github.io/Lolosin/):
//   build dengan VITE_BASE_PATH='/Lolosin/'.
// PWA manifest (start_url/scope) ikut base yang sama.
const basePath = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: basePath,
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
        start_url: basePath,
        scope: basePath,
        theme_color: '#0E5C43',
        background_color: '#FAF7F2',
        // Ikon SVG (relatif terhadap manifest, jadi ikut base path).
        // Ikon PNG (192/512/maskable) belum ada di repo — konektor GitHub
        // hanya bisa push file teks; kalau sudah di-upload lewat web GitHub,
        // tambahkan lagi entri PNG-nya di sini.
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache app shell + seluruh aset build, termasuk chunk bank soal.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Bank soal (~7,3 MB) dibundel jadi satu chunk; naikkan batas
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
