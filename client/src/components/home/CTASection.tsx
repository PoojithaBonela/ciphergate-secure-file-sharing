import { Link } from 'react-router-dom'
import KeyFeatures from './KeyFeatures'

export default function CTASection() {
  return (
    <section
      className="relative py-24 lg:py-28 px-6 lg:px-8 border-t border-[#202B3D] overflow-hidden"
      aria-labelledby="cta-heading"
    >
      {/* Subtle electric-blue ambient lighting */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '400px',
          background: 'radial-gradient(ellipse, rgba(41,151,255,0.06) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      <div className="max-w-6xl mx-auto text-center relative z-10 flex flex-col items-center">
        {/* Heading */}
        <h2
          id="cta-heading"
          className="font-semibold tracking-tight text-[#F5F7FA] mb-3 text-2xl sm:text-3xl"
          style={{ lineHeight: 1.25 }}
        >
          Secure file sharing, on your terms.
        </h2>

        {/* Description */}
        <p className="text-sm sm:text-[15px] leading-relaxed text-[#A1ADBF] max-w-md mx-auto">
          Protect your files, control access, and share privately without
          built-in messaging.
        </p>

        {/* Key Features Cards directly below heading and description */}
        <KeyFeatures />

        {/* Primary CTA */}
        <div className="mt-4">
          <Link
            to="/encrypt"
            className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#F5F7FA] text-[#050913] text-sm font-semibold tracking-wide transition-all duration-200 hover:bg-white hover:shadow-[0_0_28px_rgba(249,250,252,0.14)] active:scale-[0.98]"
          >
            Secure a file
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
