import { ShieldCheck, Settings2, Eye, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Feature {
  Icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    Icon: ShieldCheck,
    title: 'Password-Based Encryption',
    description:
      'Files are intended to be encrypted in the browser before upload, so the server never receives plaintext data.',
  },
  {
    Icon: Settings2,
    title: 'Controlled Access',
    description:
      'Senders can configure expiration windows, access counts, and sharing permissions before distributing a link.',
  },
  {
    Icon: Eye,
    title: 'Optional Security Checks',
    description:
      'Location-based access restrictions and consent-based camera verification are available for sensitive transfers.',
  },
  {
    Icon: Trash2,
    title: 'Automatic Cleanup',
    description:
      'Stored files are scheduled for deletion following the transfer lifecycle, reducing long-term data retention.',
  },
]

export default function SecurityFeatures() {
  return (
    <section
      className="py-24 px-5 sm:px-6 bg-[#0B1628] border-t border-[#27374D]/60"
      aria-labelledby="features-heading"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <header className="text-center mb-14">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#2997FF] mb-3">
            Security design
          </p>
          <h2
            id="features-heading"
            className="text-[clamp(1.75rem,4vw,2.25rem)] font-bold text-[#F5F7FA] tracking-[-0.015em] mb-4"
          >
            Built with intention.
          </h2>
          <p className="text-[14.5px] text-[#AAB8CC] max-w-lg mx-auto leading-relaxed">
            Each capability reflects a deliberate design decision about how files
            should be protected, shared, and removed.
          </p>
        </header>

        {/* Feature cards */}
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 list-none m-0 p-0"
          role="list"
        >
          {FEATURES.map(({ Icon, title, description }) => (
            <li
              key={title}
              className="p-6 rounded-xl bg-[#111D2E] border border-[#27374D] hover:border-[#2997FF]/30 hover:bg-[#162236] transition-all duration-300 group"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-[#2997FF]/10 flex items-center justify-center mb-5 group-hover:bg-[#2997FF]/16 transition-colors duration-300">
                <Icon
                  className="w-[18px] h-[18px] text-[#2997FF]"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>

              {/* Title */}
              <h3 className="text-[13.5px] font-semibold text-[#F5F7FA] mb-2.5 leading-snug tracking-[-0.01em]">
                {title}
              </h3>

              {/* Description */}
              <p className="text-[12.5px] text-[#AAB8CC] leading-relaxed">
                {description}
              </p>
            </li>
          ))}
        </ul>

        {/* Disclaimer */}
        <p className="text-center text-[11.5px] text-[#27374D] mt-10">
          These capabilities describe the intended product design and have not all been independently verified.
        </p>
      </div>
    </section>
  )
}
