/**
 * Lolo, maskot Lolosin: blob hijau geometris bertopi wisuda amber.
 * Flat, 2-3 bentuk sederhana, garis ink 2-3px, warna hijau #0E5C43 +
 * amber #F59E0B sesuai palet app.
 *
 * Sejak v2.1 Lolo adalah wajah brand: tampil besar di landing (hero
 * dan seksi "Kenalan, ini Lolo!") dan di dashboard, selalu dengan
 * namanya yang terlihat. Identitas karakternya JANGAN digambar ulang
 * jadi karakter lain; variasi hanya lewat mood dan ukuran.
 */
export type MascotMood = 'senang' | 'semangat' | 'sedih' | 'kagum'

interface MascotProps {
  /** Ekspresi: senang (default), semangat (mata tertawa + mulut terbuka),
      sedih (alis turun, mulut cemberut ringan), kagum (mata membelalak
      + mulut "o" kecil, untuk momen perkenalan atau kejutan seru). */
  mood?: MascotMood
  /** Ukuran kotak SVG dalam px (default 64). */
  size?: number
  className?: string
}

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === 'semangat') {
    // Mata tertawa tertutup (^ ^).
    return (
      <g
        stroke="#1B1E1C"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M29 53 Q36 45 43 53" />
        <path d="M53 53 Q60 45 67 53" />
      </g>
    )
  }
  if (mood === 'sedih') {
    // Mata menunduk + alis naik ke arah tengah (kecewa ringan, bukan
    // marah: ujung dalam alis LEBIH TINGGI dari ujung luar).
    return (
      <g>
        <circle cx="36" cy="52" r="6.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="60" cy="52" r="6.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="37" cy="54.5" r="3" fill="#1B1E1C" />
        <circle cx="61" cy="54.5" r="3" fill="#1B1E1C" />
        <g stroke="#1B1E1C" strokeWidth="2.5" strokeLinecap="round">
          <path d="M30 45.5 L41 42" />
          <path d="M66 45.5 L55 42" />
        </g>
      </g>
    )
  }
  if (mood === 'kagum') {
    // Mata membelalak (lebih besar, pupil lebih besar) + alis naik.
    return (
      <g>
        <circle cx="36" cy="52" r="7.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="60" cy="52" r="7.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="36" cy="52" r="3.6" fill="#1B1E1C" />
        <circle cx="60" cy="52" r="3.6" fill="#1B1E1C" />
        <circle cx="37.5" cy="50" r="1.3" fill="#FFFFFF" />
        <circle cx="61.5" cy="50" r="1.3" fill="#FFFFFF" />
        <g stroke="#1B1E1C" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M29 42 Q36 39 43 42" />
          <path d="M53 42 Q60 39 67 42" />
        </g>
      </g>
    )
  }
  // Senang: mata bulat terbuka.
  return (
    <g>
      <circle cx="36" cy="52" r="7" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
      <circle cx="60" cy="52" r="7" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
      <circle cx="37" cy="53" r="3.2" fill="#1B1E1C" />
      <circle cx="61" cy="53" r="3.2" fill="#1B1E1C" />
      <circle cx="38.5" cy="51" r="1.3" fill="#FFFFFF" />
      <circle cx="62.5" cy="51" r="1.3" fill="#FFFFFF" />
    </g>
  )
}

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === 'semangat') {
    // Mulut terbuka lebar (senyum besar).
    return <path d="M39 60 Q48 74 57 60 Z" fill="#1B1E1C" />
  }
  if (mood === 'sedih') {
    // Cemberut ringan.
    return (
      <path
        d="M41 67 Q48 62 55 67"
        fill="none"
        stroke="#1B1E1C"
        strokeWidth="3"
        strokeLinecap="round"
      />
    )
  }
  if (mood === 'kagum') {
    // Mulut "o" kecil.
    return <ellipse cx="48" cy="66" rx="5" ry="6.5" fill="#1B1E1C" />
  }
  // Senyum biasa.
  return (
    <path
      d="M37 63 Q48 71 59 63"
      fill="none"
      stroke="#1B1E1C"
      strokeWidth="3"
      strokeLinecap="round"
    />
  )
}

export function Mascot({ mood = 'senang', size = 64, className }: MascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Lolo, maskot Lolosin"
      className={className}
    >
      {/* Badan blob hijau */}
      <ellipse
        cx="48"
        cy="54"
        rx="32"
        ry="30"
        fill="#0E5C43"
        stroke="#1B1E1C"
        strokeWidth="3"
      />
      {/* Kilau halus di badan */}
      <ellipse
        cx="34"
        cy="40"
        rx="8"
        ry="5"
        fill="#84BCA6"
        opacity="0.4"
        transform="rotate(-20 34 40)"
      />
      {/* Topi wisuda amber, sedikit miring */}
      <g transform="rotate(-8 48 20)">
        <rect
          x="36"
          y="22"
          width="24"
          height="9"
          rx="4"
          fill="#D97706"
          stroke="#1B1E1C"
          strokeWidth="2.5"
        />
        <polygon
          points="48,6 74,17 48,28 22,17"
          fill="#F59E0B"
          stroke="#1B1E1C"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M74 17 L78 30"
          stroke="#1B1E1C"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle
          cx="78"
          cy="32"
          r="3.5"
          fill="#D97706"
          stroke="#1B1E1C"
          strokeWidth="2"
        />
      </g>
      {/* Pipi merona (tidak untuk mood sedih) */}
      {mood !== 'sedih' && (
        <g fill="#FCD34D" opacity="0.8">
          <ellipse cx="26" cy="61" rx="4" ry="2.8" />
          <ellipse cx="70" cy="61" rx="4" ry="2.8" />
        </g>
      )}
      <Eyes mood={mood} />
      <Mouth mood={mood} />
    </svg>
  )
}
