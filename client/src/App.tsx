import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import EncryptPage from '@/pages/EncryptPage'
import DecryptPage from '@/pages/DecryptPage'
import DashboardPage from '@/pages/DashboardPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/encrypt"   element={<EncryptPage />} />
        <Route path="/decrypt"   element={<DecryptPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*"          element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
