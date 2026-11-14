import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import AuthPage from './pages/AuthPage'
import { BelajarPage } from './pages/BelajarPage'
import { HomePage } from './pages/HomePage'
import { LatihanJalanPage } from './pages/LatihanJalanPage'
import { LatihanPage } from './pages/LatihanPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { MateriDetailPage } from './pages/MateriDetailPage'
import { SectionDetailPage } from './pages/SectionDetailPage'
import { TryoutHasilPage } from './pages/TryoutHasilPage'
import { TryoutPage } from './pages/TryoutPage'

/**
 * Gulir ke atas setiap pindah halaman. React Router tidak mereset
 * posisi gulir sendiri, jadi tanpa ini pengguna yang mengetuk tautan
 * dari bagian bawah halaman panjang (misal tombol Mulai ulas di
 * dashboard) mendarat di halaman baru dalam keadaan sudah tergulir,
 * dan judul halaman tertutup header sticky. Ketemu saat QA Fase 3.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="belajar" element={<BelajarPage />} />
        <Route path="belajar/:materiId" element={<MateriDetailPage />} />
        <Route
          path="belajar/:materiId/:sectionId"
          element={<SectionDetailPage />}
        />
        <Route path="latihan" element={<LatihanPage />} />
        <Route path="latihan/jalan" element={<LatihanJalanPage />} />
        <Route
          path="latihan/ulas"
          element={<LatihanJalanPage mode="review" />}
        />
        <Route path="tryout" element={<TryoutPage />} />
        <Route path="tryout/hasil" element={<TryoutHasilPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}
