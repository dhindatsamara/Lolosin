/**
 * Maskot Lolosin (nama dari MASCOT_NAME, jangan hardcode): blob hijau
 * geometris bertopi wisuda amber. Flat, 2-3 bentuk sederhana, garis
 * ink 2-3px, badan hijau terang #2FBF71 + amber #F59E0B.
 *
 * Sejak v2.1 maskot adalah wajah brand: tampil besar di landing (hero
 * dan seksi kenalan) dan di dashboard, selalu dengan namanya yang
 * terlihat. Identitas karakternya JANGAN digambar ulang jadi karakter
 * lain; variasi hanya lewat mood, ukuran, dan outfit peliharaan.
 *
 * v2.2: badan hijau terang (#2FBF71) supaya nge-pop di atas hero
 * landing hijau gelap; sebelumnya #0E5C43 nyaru dengan background.
 * Outfit peliharaan (syal/kacamata/mahkota/jubah) mengikuti streak,
 * lihat src/lib/pet.ts.
 *
 * v2.2.1: mood 'kagum' didesain ulang jadi cute (mata kecil, senyum
 * terbuka kecil, tanpa mata membelalak dan tanpa mulut "o") karena
 * versi lamanya terlihat melotot dan seram di favicon/ikon. Mood
 * baru 'marah' (cute marah: alis miring, cemberut kecil, mata normal)
 * HANYA dipakai saat streak putus, lihat mekanik "Bujuk Osi" di
 * src/lib/store.ts. Jangan pakai 'marah' di tempat lain. Prop aditif
 * 'showCap' (default true) dan 'headphones' (default false) dipakai
 * varian avatar di pemilih avatar; pemakaian lama tanpa kedua prop
 * itu tampil sama persis seperti sebelumnya.
 */
import { MASCOT_NAME } from '../lib/mascot'
import type { PetOutfit } from '../lib/pet'

export type MascotMood = 'senang' | 'semangat' | 'sedih' | 'kagum' | 'marah'

interface MascotProps {
  /** Ekspresi: senang (default), semangat (mata tertawa + mulut terbuka),
      sedih (alis turun, mulut cemberut ringan), kagum (mata kecil +
      alis naik + senyum terbuka kecil, untuk momen perkenalan atau
      kejutan seru), marah (cute marah: alis miring + cemberut kecil,
      HANYA untuk streak putus). */
  mood?: MascotMood
  /** Ukuran kotak SVG dalam px (default 64). */
  size?: number
  /** Outfit peliharaan dari streak (default 'none', tanpa aksesori). */
  outfit?: PetOutfit
  /** Tampilkan topi wisuda (default true). False untuk varian avatar
      tanpa topi, mis. varian polos dan varian headphone. */
  showCap?: boolean
  /** Pakai headphone (default false). Hanya dipakai varian avatar
      musik di pemilih avatar; bukan bagian dari tahapan streak. */
  headphones?: boolean
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
  if (mood === 'marah') {
    // Cute marah: alis miring (ujung dalam ke bawah), mata ukuran
    // normal menunduk ke samping, pupil kecil. Tanpa melotot.
    return (
      <g>
        <circle cx="36" cy="52" r="6.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="60" cy="52" r="6.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="34.5" cy="54" r="3" fill="#1B1E1C" />
        <circle cx="61.5" cy="54" r="3" fill="#1B1E1C" />
        <circle cx="35.8" cy="52.2" r="1.2" fill="#FFFFFF" />
        <circle cx="62.8" cy="52.2" r="1.2" fill="#FFFFFF" />
        <g stroke="#1B1E1C" strokeWidth="2.5" strokeLinecap="round">
          <path d="M29 43 L42 48" />
          <path d="M67 43 L54 48" />
        </g>
      </g>
    )
  }
  if (mood === 'kagum') {
    // Kagum versi cute (v2.2.1): mata lebih kecil dari 'senang', pupil
    // kecil, alis naik. Sengaja tanpa mata membelalak supaya tidak
    // terlihat melotot atau seram.
    return (
      <g>
        <circle cx="36" cy="52" r="6.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="60" cy="52" r="6.5" fill="#FFFFFF" stroke="#1B1E1C" strokeWidth="2.5" />
        <circle cx="36" cy="52" r="2.8" fill="#1B1E1C" />
        <circle cx="60" cy="52" r="2.8" fill="#1B1E1C" />
        <circle cx="37.2" cy="50.2" r="1.2" fill="#FFFFFF" />
        <circle cx="61.2" cy="50.2" r="1.2" fill="#FFFFFF" />
        <g stroke="#1B1E1C" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M29 41 Q36 38 43 41" />
          <path d="M53 41 Q60 38 67 41" />
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
  if (mood === 'marah') {
    // Cemberut kecil (ngambek lucu, bukan marah besar).
    return (
      <path
        d="M43 67 Q48 63.5 53 67"
        fill="none"
        stroke="#1B1E1C"
        strokeWidth="3"
        strokeLinecap="round"
      />
    )
  }
  if (mood === 'kagum') {
    // Senyum terbuka kecil (bukan lingkaran "o").
    return <path d="M42 62 Q48 70 54 62 Z" fill="#1B1E1C" />
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

/**
 * Aksesori bawah (digambar sebelum wajah supaya mulut tetap di atas):
 * syal amber untuk streak 3 hari, jubah wisuda untuk streak 30 hari.
 * Bentuknya mengikuti lekuk blob supaya tidak keluar dari badan.
 */
function OutfitBawah({ outfit }: { outfit: PetOutfit }) {
  if (outfit === 'syal') {
    return (
      <g>
        <path
          d="M24 69 Q48 79 72 69 L72 76 Q48 86 24 76 Z"
          fill="#F59E0B"
          stroke="#1B1E1C"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle
          cx="48"
          cy="77"
          r="4"
          fill="#D97706"
          stroke="#1B1E1C"
          strokeWidth="2"
        />
        <rect x="44.5" y="79" width="7" height="5" rx="2.5" fill="#D97706" />
      </g>
    )
  }
  if (outfit === 'jubah') {
    return (
      <g>
        <path
          d="M27 73 Q48 66 69 73 L69 79 Q48 86 27 79 Z"
          fill="#0B4A36"
          stroke="#1B1E1C"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M27 73 Q48 66 69 73"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="48" cy="74" r="2.5" fill="#FBBF24" />
      </g>
    )
  }
  return null
}

/** Mahkota kecil yang bertengger miring di sisi kanan topi wisuda. */
function Mahkota() {
  return (
    <g transform="rotate(12 73 10)">
      <polygon
        points="62,14 65,5 69,10 73,4 77,10 81,5 84,14"
        fill="#FBBF24"
        stroke="#1B1E1C"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect
        x="62"
        y="13"
        width="22"
        height="4"
        rx="2"
        fill="#F59E0B"
        stroke="#1B1E1C"
        strokeWidth="2"
      />
    </g>
  )
}

/** Kacamata hitam keren: menutupi mata (sengaja, biar pede). */
function Kacamata() {
  return (
    <g>
      <g stroke="#1B1E1C" strokeWidth="2.5" strokeLinecap="round">
        <path d="M26 50 L20 47" />
        <path d="M70 50 L76 47" />
        <path d="M46 50 Q48 47 50 50" fill="none" />
      </g>
      <ellipse cx="36" cy="52" rx="10" ry="8.5" fill="#1B1E1C" />
      <ellipse cx="60" cy="52" rx="10" ry="8.5" fill="#1B1E1C" />
      <ellipse
        cx="33"
        cy="49"
        rx="3"
        ry="2"
        fill="#FFFFFF"
        opacity="0.85"
        transform="rotate(-20 33 49)"
      />
      <ellipse
        cx="57"
        cy="49"
        rx="3"
        ry="2"
        fill="#FFFFFF"
        opacity="0.85"
        transform="rotate(-20 57 49)"
      />
    </g>
  )
}

/**
 * Headphone flat senada maskot: busur amber di atas kepala dan dua
 * earcup hijau gelap di sisi badan. Dipakai varian avatar musik
 * (tanpa topi wisuda). Digambar terakhir supaya earcup menutupi
 * tepi pipi dengan rapi.
 */
function Headphones() {
  return (
    <g>
      {/* Busur: garis ink tebal di bawah, amber di atas, biar ada outline */}
      <path
        d="M16 54 Q48 2 80 54"
        fill="none"
        stroke="#1B1E1C"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M16 54 Q48 2 80 54"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* Earcup kiri dan kanan */}
      <rect
        x="10"
        y="46"
        width="13"
        height="20"
        rx="6"
        fill="#0B4A36"
        stroke="#1B1E1C"
        strokeWidth="2.5"
      />
      <rect
        x="73"
        y="46"
        width="13"
        height="20"
        rx="6"
        fill="#0B4A36"
        stroke="#1B1E1C"
        strokeWidth="2.5"
      />
      <circle cx="16.5" cy="56" r="2.5" fill="#F59E0B" />
      <circle cx="79.5" cy="56" r="2.5" fill="#F59E0B" />
    </g>
  )
}

export function Mascot({
  mood = 'senang',
  size = 64,
  outfit = 'none',
  showCap = true,
  headphones = false,
  className,
}: MascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label={`${MASCOT_NAME}, maskot Lolosin`}
      className={className}
    >
      {/* Badan blob hijau terang (nge-pop di atas hero hijau gelap) */}
      <ellipse
        cx="48"
        cy="54"
        rx="32"
        ry="30"
        fill="#2FBF71"
        stroke="#1B1E1C"
        strokeWidth="3"
      />
      {/* Kilau halus di badan */}
      <ellipse
        cx="34"
        cy="40"
        rx="8"
        ry="5"
        fill="#B8F1D1"
        opacity="0.55"
        transform="rotate(-20 34 40)"
      />
      <OutfitBawah outfit={outfit} />
      {/* Topi wisuda amber, sedikit miring (bisa disembunyikan lewat
          showCap untuk varian avatar tanpa topi) */}
      {showCap && (
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
      )}
      {/* Mahkota (streak 14 hari, dan ikut dipakai di tahap jubah) */}
      {(outfit === 'mahkota' || outfit === 'jubah') && <Mahkota />}
      {/* Pipi merona (tidak untuk mood sedih) */}
      {mood !== 'sedih' && (
        <g fill="#FCD34D" opacity="0.8">
          <ellipse cx="26" cy="61" rx="4" ry="2.8" />
          <ellipse cx="70" cy="61" rx="4" ry="2.8" />
        </g>
      )}
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      {/* Kacamata digambar terakhir supaya menutupi mata */}
      {outfit === 'kacamata' && <Kacamata />}
      {/* Headphone digambar paling akhir supaya earcup rapi di sisi badan */}
      {headphones && <Headphones />}
    </svg>
  )
}
