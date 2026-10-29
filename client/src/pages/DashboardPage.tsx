import { Link } from 'react-router-dom'
import { LayoutDashboard, ArrowLeft } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-5 py-28">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-xl bg-[#111D2E] border border-[#27374D] flex items-center justify-center mx-auto mb-7">
            <LayoutDashboard
              className="w-6 h-6 text-[#2997FF]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>

          <h1 className="text-[1.5rem] font-bold text-[#F5F7FA] mb-3 tracking-[-0.015em]">
            Sender Dashboard
          </h1>

          <p className="text-[13.5px] text-[#AAB8CC] leading-relaxed mb-9">
            The sender dashboard is under development. It will provide a 24-hour
            security review window with access logs, metadata, and revocation
            controls.
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
