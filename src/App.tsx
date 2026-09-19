import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { BookingPage } from './pages/BookingPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { PaymentStatusPage } from './pages/PaymentStatusPage'
import { ServicesPage } from './pages/ServicesPage'

const AdminPage = lazy(async () => {
  const module = await import('./pages/AdminPage')
  return { default: module.AdminPage }
})

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/book" element={<BookingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/booking/success" element={<PaymentStatusPage status="success" />} />
        <Route path="/booking/cancelled" element={<PaymentStatusPage status="cancelled" />} />
      </Route>
      <Route path="/admin" element={<Suspense fallback={<div className="admin-state"><h1>Loading administration portal…</h1></div>}><AdminPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
