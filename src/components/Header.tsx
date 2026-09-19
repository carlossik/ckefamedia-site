import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'

const links = [
  { to: '/', label: 'Home' },
  { to: '/services', label: 'Services' },
  { to: '/#work', label: 'Our work' },
  { to: '/#ecosystem', label: 'CKEFA ecosystem' },
  { to: '/contact', label: 'Contact' },
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="site-header">
      <div className="site-header__inner page-shell">
        <Brand compact />
        <button
          className="menu-button"
          type="button"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav className={`main-nav ${open ? 'main-nav--open' : ''}`} aria-label="Main navigation">
          {links.map((item) =>
            item.to.includes('#') ? (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ) : (
              <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </NavLink>
            ),
          )}
          <Link className="button button--small button--primary" to="/book" onClick={() => setOpen(false)}>
            Check availability
          </Link>
        </nav>
      </div>
    </header>
  )
}
