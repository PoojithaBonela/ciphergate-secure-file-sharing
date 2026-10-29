import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="border-t border-[#202B3D] py-10 px-6 lg:px-8"
      style={{ background: '#050913' }}
      aria-label="Site footer"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-2.5"
          aria-label="Encra — home"
        >
          <Shield className="w-4 h-4 text-[#2997FF]" strokeWidth={1.5} aria-hidden />
          <span className="font-bold text-[15px] tracking-tight" style={{ color: '#F5F7FA' }}>
            Encra
          </span>
        </Link>

        {/* Tagline */}
        <p className="text-[12.5px] text-center" style={{ color: '#A1ADBF' }}>
          Private by design.&nbsp; Secure by default.
        </p>

        {/* Copyright */}
        <p className="text-[11.5px]" style={{ color: '#202B3D' }}>
          &copy; {year} Encra
        </p>
      </div>
    </footer>
  )
}
