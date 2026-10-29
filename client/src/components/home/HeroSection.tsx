import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import encraLockImg from '@/assets/encralock.png'

/* ─── Approved copy ────────────────────────────────────────────────────────── */
const HEADLINE_LINES = [
  'Secure your files.',
  'Set your rules.',
  'Own your privacy.',
] as const

// Line 2 gets the muted-blue tint for editorial contrast
const LINE_COLORS: Record<number, string> = {
  0: '#F5F7FA',
  1: '#8CA4C5',
  2: '#F5F7FA',
}

const TYPING_SPEED_MS  = 48   // ms per character
const INTER_LINE_MS    = 380  // pause between lines
const INITIAL_DELAY_MS = 500  // pause before typing starts

/* ─── Reduced-motion check ─────────────────────────────────────────────────── */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── useTypewriter ─────────────────────────────────────────────────────────── */
function useTypewriter(lines: readonly string[]) {
  const [displayed, setDisplayed]     = useState<string[]>(['', '', ''])
  const [activeLineIdx, setActive]    = useState(0)
  const [done, setDone]               = useState(false)

  const lineRef = useRef(0)
  const charRef = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayed(lines.slice() as string[])
      setDone(true)
      return
    }

    let tid: ReturnType<typeof setTimeout>

    const step = () => {
      const li = lineRef.current
      const ci = charRef.current

      if (li >= lines.length) {
        setDone(true)
        return
      }

      const line = lines[li]
      const nextCi = ci + 1

      if (nextCi <= line.length) {
        charRef.current = nextCi
        setDisplayed(prev => {
          const next = [...prev]
          next[li] = line.slice(0, nextCi)
          return next
        })
        tid = setTimeout(step, TYPING_SPEED_MS)
      } else {
        // line complete — advance
        lineRef.current  = li + 1
        charRef.current  = 0
        setActive(li + 1)
        tid = setTimeout(step, INTER_LINE_MS)
      }
    }

    tid = setTimeout(step, INITIAL_DELAY_MS)
    return () => clearTimeout(tid)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { displayed, activeLineIdx, done }
}

/* ─── HeroSection ───────────────────────────────────────────────────────────── */
export default function HeroSection() {
  const { displayed, activeLineIdx, done } = useTypewriter(HEADLINE_LINES)

  /* Scroll-to-how-it-works */
  const scrollToSteps = useCallback(() => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  /* encralock.png — scroll-responsive fade via direct DOM mutation (no re-render) */
  const imageWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const el = imageWrapRef.current
    if (!el) return

    const onScroll = () => {
      const progress   = Math.min(1, window.scrollY / 480)
      el.style.opacity   = String(Math.max(0.06, 1 - progress * 0.94))
      el.style.transform = `translateY(${progress * -22}px)`
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Scroll indicator — fade out via direct DOM mutation */
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = indicatorRef.current
    if (!el) return

    const onScroll = () => {
      el.style.opacity = String(Math.max(0, 1 - window.scrollY / 110))
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section
      className="relative min-h-screen flex flex-col overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Subtle top radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 60% 0%, rgba(41,151,255,0.055) 0%, transparent 60%)',
        }}
      />

      {/* ── Two-column content ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center max-w-6xl mx-auto w-full px-6 lg:px-8 pt-28 pb-20 lg:pt-0 lg:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center w-full">

          {/* ── Left column ──────────────────────────────────────────── */}
          <div className="flex flex-col order-2 lg:order-1">

            {/* Typed headline */}
            {/*
              Layout-shift prevention: invisible full text reserves height;
              absolutely-positioned typed overlay reveals characters.
              Screen reader gets the static full text via aria-label.
            */}
            <h1
              id="hero-heading"
              className="relative mb-8 leading-[1.1] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(2.4rem, 5vw, 3.8rem)', fontWeight: 700 }}
              aria-label={HEADLINE_LINES.join(' ')}
            >
              {/* Space reservation (invisible) */}
              <span className="invisible block" aria-hidden>
                {HEADLINE_LINES.map((line, i) => (
                  <span key={i} className="block">{line}</span>
                ))}
              </span>

              {/* Typed overlay */}
              <span className="absolute inset-0 flex flex-col" aria-hidden>
                {HEADLINE_LINES.map((_line, i) => (
                  <span
                    key={i}
                    className="block"
                    style={{ color: LINE_COLORS[i] }}
                  >
                    {displayed[i] ?? ''}
                    {/* Caret on the currently-typing line */}
                    {i === activeLineIdx && !done && (
                      <span className="typing-caret" />
                    )}
                    {/* Ghost space so empty lines hold height */}
                    {!displayed[i] && <span aria-hidden>&nbsp;</span>}
                  </span>
                ))}
              </span>
            </h1>

            {/* Supporting copy */}
            <div className="mb-10 max-w-lg space-y-3">
              <p
                className="font-semibold leading-snug"
                style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: '#F5F7FA' }}
              >
                Sensitive files deserve more than a link.
              </p>
              <p
                className="leading-relaxed"
                style={{ fontSize: '0.9375rem', color: '#A1ADBF' }}
              >
                Encra lets you encrypt files with a password, control who can
                access them, and set conditions for when and where they can be
                opened. No built-in chat. No unnecessary communication. Just
                private file sharing on your terms.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Primary — white pill */}
              <Link
                to="/encrypt"
                className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#F5F7FA] text-[#050913] text-[13.5px] font-semibold tracking-wide transition-all duration-200 hover:bg-white hover:shadow-[0_0_32px_rgba(249,250,252,0.15)] active:scale-[0.97]"
              >
                Secure a file
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>

              {/* Secondary — text link */}
              <button
                type="button"
                onClick={scrollToSteps}
                className="group inline-flex items-center gap-2 text-[13.5px] font-medium tracking-wide text-[#A1ADBF] hover:text-[#F5F7FA] transition-colors duration-150"
              >
                See how it works
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </button>
            </div>
          </div>

          {/* ── Right column — encralock.png ──────────────────────── */}
          <div className="relative flex items-center justify-center order-1 lg:order-2">
            {/* Blue ambient glow behind the image */}
            <div
              aria-hidden
              className="absolute pointer-events-none rounded-full"
              style={{
                width: '70%',
                height: '70%',
                background: 'radial-gradient(circle, rgba(41,151,255,0.14) 0%, transparent 70%)',
                filter: 'blur(40px)',
              }}
            />

            {/* encralock.png — scroll-fade container */}
            <div
              ref={imageWrapRef}
              className="relative z-10 w-full max-w-[420px] lg:max-w-none"
              style={{ willChange: 'opacity, transform' }}
            >
              <img
                src={encraLockImg}
                alt=""
                role="presentation"
                className="w-full h-auto"
                style={{ objectFit: 'contain', maxHeight: '520px' }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Scroll indicator ──────────────────────────────────────── */}
      <div
        ref={indicatorRef}
        aria-hidden
        className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 pointer-events-none"
      >
        {/* Animated mouse icon */}
        <div className="scroll-bounce flex flex-col items-center gap-1.5">
          <svg width="20" height="30" viewBox="0 0 20 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="18" height="28" rx="9" stroke="#8CA4C5" strokeWidth="1.25" />
            <rect x="9" y="6" width="2" height="6" rx="1" fill="#8CA4C5" />
          </svg>
          <p className="text-[10.5px] tracking-[0.18em] uppercase" style={{ color: '#8CA4C5' }}>
            Scroll to explore
          </p>
        </div>
      </div>
    </section>
  )
}
