/**
 * GlowingLock — Premium SVG lock with CSS floating animation and blue glow.
 *
 * Implemented purely with SVG + CSS:
 *   - Layered linear/radial gradients for pseudo-3D depth.
 *   - SVG filter for outer blue bloom.
 *   - CSS keyframe animation (lock-float, lock-glow) defined in global.css.
 *   - Respects `prefers-reduced-motion` via the lock-float / lock-glow classes.
 */
export default function GlowingLock() {
  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: 240, height: 240 }}
      aria-hidden="true"
    >
      {/* Outer ambient glow halo */}
      <div
        className="lock-glow absolute rounded-full pointer-events-none"
        style={{
          width: 220,
          height: 220,
          background:
            'radial-gradient(circle, rgba(41,151,255,0.22) 0%, rgba(41,151,255,0.06) 45%, transparent 70%)',
        }}
      />

      {/* Middle ring */}
      <div
        className="lock-ring absolute rounded-full pointer-events-none"
        style={{
          width: 190,
          height: 190,
          border: '1px solid rgba(41,151,255,0.22)',
        }}
      />

      {/* Floating lock */}
      <div className="lock-float relative z-10">
        <svg
          width="160"
          height="172"
          viewBox="0 0 160 172"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Encra security lock illustration"
        >
          <defs>
            {/* Blue outer bloom */}
            <filter id="bloom" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Soft inner glow for keyhole */}
            <filter id="inner-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Lock body: dark metallic gradient, top-left lit */}
            <linearGradient id="body-grad" x1="0%" y1="0%" x2="60%" y2="100%">
              <stop offset="0%"   stopColor="#1B2F4A" />
              <stop offset="40%"  stopColor="#0F1E31" />
              <stop offset="100%" stopColor="#090F1C" />
            </linearGradient>

            {/* Body top-surface sheen */}
            <linearGradient id="sheen-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="rgba(85,184,255,0.12)" />
              <stop offset="100%" stopColor="rgba(41,151,255,0)" />
            </linearGradient>

            {/* Shackle: electric-blue gradient */}
            <linearGradient id="shackle-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#1E78D4" />
              <stop offset="50%"  stopColor="#55B8FF" />
              <stop offset="100%" stopColor="#1E78D4" />
            </linearGradient>

            {/* Shackle inner highlight */}
            <linearGradient id="shackle-inner" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
              <stop offset="50%"  stopColor="rgba(255,255,255,0.35)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>

            {/* Keyhole circle: inner radial glow */}
            <radialGradient id="keyhole-grad" cx="35%" cy="35%" r="65%">
              <stop offset="0%"   stopColor="#73C8FF" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#2997FF" stopOpacity="0.7" />
            </radialGradient>
          </defs>

          {/* Ground shadow */}
          <ellipse
            cx="80"
            cy="167"
            rx="46"
            ry="5"
            fill="rgba(0,0,0,0.4)"
          />

          {/* ── Lock body ───────────────────────────────────────── */}
          {/* Base shape */}
          <rect
            x="22"
            y="88"
            width="116"
            height="72"
            rx="12"
            fill="url(#body-grad)"
            stroke="#2997FF"
            strokeWidth="1.25"
            filter="url(#bloom)"
          />

          {/* Top-face sheen overlay */}
          <rect
            x="22"
            y="88"
            width="116"
            height="36"
            rx="12"
            fill="url(#sheen-grad)"
          />

          {/* Left-edge highlight (simulates top-left light source) */}
          <line
            x1="22.6"
            y1="100"
            x2="22.6"
            y2="148"
            stroke="rgba(85,184,255,0.35)"
            strokeWidth="1.2"
          />

          {/* Top-edge highlight */}
          <line
            x1="32"
            y1="88.6"
            x2="128"
            y2="88.6"
            stroke="rgba(85,184,255,0.25)"
            strokeWidth="1.2"
          />

          {/* Subtle center groove */}
          <line
            x1="36"
            y1="124"
            x2="124"
            y2="124"
            stroke="rgba(39,55,77,0.8)"
            strokeWidth="1"
          />

          {/* ── Shackle (U-arch) ─────────────────────────────────── */}
          {/* Outer shackle — glowing blue */}
          <path
            d="M 50 92 L 50 52 Q 50 24 80 24 Q 110 24 110 52 L 110 92"
            stroke="url(#shackle-grad)"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
            filter="url(#bloom)"
          />

          {/* Inner shackle highlight */}
          <path
            d="M 50 92 L 50 52 Q 50 24 80 24 Q 110 24 110 52 L 110 92"
            stroke="url(#shackle-inner)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />

          {/* ── Keyhole ──────────────────────────────────────────── */}
          {/* Outer keyhole circle */}
          <circle
            cx="80"
            cy="120"
            r="11"
            fill="url(#keyhole-grad)"
            stroke="rgba(41,151,255,0.5)"
            strokeWidth="1"
            filter="url(#inner-glow)"
          />

          {/* Keyhole slot */}
          <rect
            x="77"
            y="128"
            width="6"
            height="16"
            rx="3"
            fill="rgba(41,151,255,0.75)"
          />

          {/* Keyhole inner specular */}
          <ellipse
            cx="76.5"
            cy="117"
            rx="3"
            ry="2.5"
            fill="rgba(255,255,255,0.28)"
          />
        </svg>
      </div>
    </div>
  )
}
