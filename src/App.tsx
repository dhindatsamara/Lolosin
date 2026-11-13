import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { BelajarPage } from './pages/BelajarPage'
import { HomePage } from './pages/HomePage'
import { LatihanJalanPage } from './pages/LatihanJalanPage'
import { LatihanPage } from './pages/LatihanPage'
import { MateriDetailPage } from './pages/MateriDetailPage'
import { SectionDetailPage } from './pages/SectionDetailPage'
import { TryoutHasilPage } from './pages/TryoutHasilPage'
import { TryoutPage } from './pages/TryoutPage'

export default function App() {
  return (
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
        <Route path="tryout" element={<TryoutPage />} />
        <Route path="tryout/hasil" element={<TryoutHasilPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
