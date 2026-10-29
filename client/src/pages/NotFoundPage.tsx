import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-5 py-28">
        <div className="text-center max-w-sm">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#2997FF] mb-5">
            404
          </p>
          <h1 className="text-[1.5rem] font-bold text-[#F5F7FA] mb-3 tracking-[-0.015em]">
            Page not found
          </h1>
          <p className="text-[13.5px] text-[#AAB8CC] leading-relaxed mb-9">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[13px] text-[#2997FF] hover:text-[#55B8FF] transition-colors duration-150"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
