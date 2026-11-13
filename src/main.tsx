import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

// Font self-hosted via Fontsource — HARUS diimpor SEBELUM './index.css'
// agar @font-face terdaftar sebelum stylesheet utama dipakai.
// Poppins (display/heading) 600/700/800 · Plus Jakarta Sans (body/UI)
// 400/500/600/700/800 · Caveat (aksen script) 600/700.
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-800.css'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/caveat/latin-600.css'
import '@fontsource/caveat/latin-700.css'
import './index.css'
import App from './App.tsx'

// Service worker PWA (autoUpdate): diaktifkan saat production build.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
