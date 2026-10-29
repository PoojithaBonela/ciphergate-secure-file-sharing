import { Files, SlidersHorizontal, KeyRound, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
  step: string
  Icon: LucideIcon
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    step: '01 / PROTECT',
    Icon: Files,
    title: 'Encrypt your files',
    description:
      'Secure images, PDFs, Word documents, text files and more with AES-256-GCM encryption before upload.',
  },
  {
    step: '02 / CUSTOMIZE',
    Icon: SlidersHorizontal,
    title: 'Set your rules',
    description:
      'Set a password, configure location restrictions, enable optional camera checks, and choose whether recipients can view or download files.',
  },
  {
    step: '03 / ACCESS',
    Icon: KeyRound,
    title: 'Share or enter to decrypt',
    description:
      'Share an access link if you wish, or let recipients open Encra directly. They enter the transfer details and password, then complete any enabled security checks.',
  },
  {
    step: '04 / STAY IN CONTROL',
    Icon: ShieldCheck,
    title: 'Review and revoke',
    description:
      'Review access activity and security details for 24 hours, revoke access when needed, and let files expire or be deleted according to your configured rules.',
  },
]

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-24 px-6 lg:px-8 border-t border-[#202B3D]"
      aria-labelledby="how-heading"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <header className="mb-14">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase mb-3" style={{ color: '#2997FF' }}>
            How it works
          </p>
          <h2
            id="how-heading"
            className="font-bold tracking-[-0.015em]"
            style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)', color: '#F5F7FA' }}
          >
            Simple. Controlled. Private.
          </h2>
        </header>

        {/* Four Cards Grid: 1 col on mobile, 2 cols on tablet, 4 cols on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map(({ step, Icon, title, description }) => (
            <article
              key={step}
              tabIndex={0}
              className="group relative bg-[#0A1220] rounded-xl p-6 lg:p-7 border border-[#202B3D] flex flex-col h-full transition-all duration-300 ease-out hover:border-[#2997FF] hover:shadow-[0_0_24px_rgba(41,151,255,0.18)] hover:-translate-y-1 focus-visible:border-[#2997FF] focus-visible:shadow-[0_0_24px_rgba(41,151,255,0.18)] focus-visible:-translate-y-1 focus:outline-none"
            >
              {/* Top row: Icon & Step label */}
              <div className="flex items-center justify-between mb-5">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#2997FF]/10 text-[#2997FF] group-hover:bg-[#2997FF]/18 group-hover:text-[#52aaff] transition-colors duration-300 shrink-0"
                  aria-hidden
                >
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <span
                  className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#8CA4C5] group-hover:text-[#2997FF] transition-colors duration-300"
                >
                  {step}
                </span>
              </div>

              {/* Card heading */}
              <h3 className="font-bold text-[17px] text-[#F5F7FA] tracking-tight mb-2.5">
                {title}
              </h3>

              {/* Card description */}
              <p className="text-[13.5px] text-[#A1ADBF] leading-relaxed flex-1">
                {description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
