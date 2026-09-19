import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'

export function SiteLayout() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      const section = document.getElementById(location.hash.slice(1))
      if (section) {
        window.requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth' }))
        return
      }
    }

    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.hash])

  return (
    <div className="site-frame">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
