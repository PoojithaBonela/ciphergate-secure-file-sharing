import { useState, useEffect, useCallback } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Shield } from 'lucide-react'

const NAV_LINKS = [
  { to: '/encrypt',   label: 'Encrypt'   },
  { to: '/decrypt',   label: 'Decrypt'   },
  { to: '/dashboard', label: 'Dashboard' },
] as const

export default function Navbar() {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const location                  = useLocation()

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const toggle = useCallback(() => setMenuOpen(v => !v), [])

  return (
    <header
      className={[
        'fixed top-0 inset-x-0 z-50 transition-all duration-300',
        scrolled || menuOpen
          ? 'bg-[#050913]/95 backdrop-blur-md border-b border-[#202B3D]'
          : 'bg-transparent border-b border-transparent',
      ].join(' ')}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <nav
          className="flex items-center justify-between h-[60px]"
          aria-label="Main navigation"
        >
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group"
            aria-label="Encra — home"
          >
            <div className="w-7 h-7 flex items-center justify-center rounded-md bg-[#2997FF]/10 group-hover:bg-[#2997FF]/18 transition-colors">
              <Shield className="w-[16px] h-[16px] text-[#2997FF]" strokeWidth={1.5} aria-hidden />
            </div>
            <span className="text-[#F5F7FA] font-bold text-[16px] tracking-tight">Encra</span>
          </Link>

          {/* Desktop links */}
          <ul className="hidden md:flex items-center gap-0.5 list-none m-0 p-0">
            {NAV_LINKS.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    [
                      'relative px-4 py-2 text-[13px] font-medium tracking-wide rounded-md transition-colors duration-150',
                      isActive
                        ? 'text-[#F5F7FA]'
                        : 'text-[#A1ADBF] hover:text-[#F5F7FA]',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {label}
                      {isActive && (
                        <span className="absolute bottom-1 left-4 right-4 h-px rounded-full bg-[#2997FF]" aria-hidden />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Mobile toggle */}
          <button
            type="button"
            className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-md hover:bg-[#0D1626] transition-colors"
            onClick={toggle}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            <span className={`block w-5 h-px bg-[#A1ADBF] transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[3px]' : ''}`} />
            <span className={`block w-5 h-px bg-[#A1ADBF] transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[3px]' : ''}`} />
          </button>
        </nav>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div id="mobile-nav" className="md:hidden border-t border-[#202B3D] bg-[#050913]/98">
          <ul className="max-w-6xl mx-auto px-6 py-3 flex flex-col gap-0.5 list-none m-0">
            {NAV_LINKS.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    [
                      'block px-3 py-3 text-[13px] font-medium tracking-wide rounded-md transition-colors duration-150',
                      isActive ? 'text-[#2997FF]' : 'text-[#A1ADBF] hover:text-[#F5F7FA]',
                    ].join(' ')
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
