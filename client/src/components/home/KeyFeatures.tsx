import encraImg1 from '@/assets/encraimg1.png'
import encraImg2 from '@/assets/encraimg2.jpeg'
import encraImg3 from '@/assets/encraimg3.jpeg'
import encraImg4 from '@/assets/encraimg4.jpeg'
import encraImg5 from '@/assets/encraimg5.jpeg'

interface Feature {
  id: string
  number: string
  title: string
  description: string
  image: string
}

const FEATURES: Feature[] = [
  {
    id: 'encryption',
    number: '01 /',
    title: 'AES-256-GCM Encryption',
    description:
      'Encrypt files directly in the browser using AES-256-GCM, with password-derived keys and unique salts and IVs before upload.',
    image: encraImg1,
  },
  {
    id: 'location',
    number: '02 /',
    title: 'Location-Based Access',
    description:
      'Choose an allowed location on Google Maps and set a permitted radius. Encra checks the recipient’s location before granting access.',
    image: encraImg2,
  },
  {
    id: 'monitoring',
    number: '03 /',
    title: 'AI-Based Viewing Monitoring',
    description:
      'Optional, consent-based camera checks can flag multiple faces or unexpected viewing conditions while a file is open.',
    image: encraImg3,
  },
  {
    id: 'notifications',
    number: '04 /',
    title: 'Instant Notifications',
    description:
      'Opt in to email or WhatsApp alerts when your file is accessed or decrypted.',
    image: encraImg4,
  },
  {
    id: 'control',
    number: '05 /',
    title: 'Temporary Access & Control',
    description:
      'Set expiry times, review access activity, revoke future access, and configure automatic file deletion.',
    image: encraImg5,
  },
]

export default function KeyFeatures() {
  return (
    <div className="w-full max-w-6xl mx-auto my-12 lg:my-16">
      {/* 
        Responsive layout:
        - Desktop: 6-column grid with 3 cards in row 1 (col-span-2 each) and 2 wider cards in row 2 (col-span-3 each)
        - Tablet: 2 columns with 5th card centered
        - Mobile: 1 column
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5 lg:gap-6">
        {FEATURES.map(({ id, number, title, description, image }, index) => {
          // Cards 0, 1, 2 span 2 cols on lg; Cards 3, 4 span 3 cols on lg (wider row 2)
          const colSpanClass =
            index < 3
              ? 'lg:col-span-2'
              : 'lg:col-span-3'

          // On tablet (md), 5th card centers gracefully
          const tabletClass = index === 4 ? 'md:col-span-2 md:max-w-xl md:mx-auto w-full' : ''

          return (
            <article
              key={id}
              tabIndex={0}
              className={`group relative bg-[#0A1220]/80 backdrop-blur-sm rounded-xl p-6 sm:p-7 border border-[#202B3D] flex items-start gap-4 sm:gap-5.5 h-full transition-all duration-300 ease-out hover:border-[#2997FF] hover:shadow-[0_0_24px_rgba(41,151,255,0.18)] hover:-translate-y-1 focus-visible:border-[#2997FF] focus-visible:shadow-[0_0_24px_rgba(41,151,255,0.18)] focus-visible:-translate-y-1 focus:outline-none motion-reduce:hover:transform-none motion-reduce:transition-none ${colSpanClass} ${tabletClass}`}
            >
              {/* Square 1:1 ratio picture container */}
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 aspect-square rounded-xl overflow-hidden shrink-0 border border-[#202B3D] bg-[#050913] group-hover:border-[#2997FF]/50 shadow-[0_0_16px_rgba(41,151,255,0.12)] group-hover:shadow-[0_0_24px_rgba(41,151,255,0.25)] transition-all duration-300 mt-0.5"
                aria-hidden
              >
                <img
                  src={image}
                  alt=""
                  className="w-full h-full aspect-square object-cover"
                  draggable={false}
                />
              </div>

              {/* Vertical divider between image and text */}
              <div
                className="w-px self-stretch bg-[#202B3D] group-hover:bg-[#2997FF]/35 transition-colors duration-300 shrink-0 mx-0.5"
                aria-hidden
              />

              {/* Text content */}
              <div className="flex-1 min-w-0 text-left">
                <span className="block text-[11px] font-semibold tracking-[0.16em] uppercase text-[#8CA4C5] group-hover:text-[#2997FF] transition-colors duration-300 mb-1">
                  {number}
                </span>
                <h3 className="text-[15.5px] sm:text-[16.5px] font-bold text-[#F5F7FA] tracking-tight mb-2 leading-snug">
                  {title}
                </h3>
                <p className="text-[13px] sm:text-[13.5px] text-[#A1ADBF] leading-relaxed">
                  {description}
                </p>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
