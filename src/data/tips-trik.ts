/**
 * Tips & Trik Jawab (v2.8.2): strategi menjawab soal SKD yang
 * benar-benar berguna dan bisa dipertanggungjawabkan.
 *
 * ATURAN KONTEN: tanpa "bocoran", tanpa statistik palsu, tanpa klaim
 * "soal ini pasti keluar". Setiap tips adalah strategi umum yang
 * berlaku untuk format CAT SKD (110 soal, 100 menit, tanpa nilai
 * minus, TKP dinilai bertingkat 1 sampai 5) dan bisa dicek
 * kebenarannya dari format ujian itu sendiri.
 *
 * Setiap tips punya `mood` untuk Osi di kartunya. Mood 'marah' tidak
 * dipakai di sini: 'marah' hanya untuk streak putus (lihat
 * src/components/Mascot.tsx).
 */
import type { MascotMood } from '../components/Mascot'

export type TipsKategori = 'TWK' | 'TIU' | 'TKP' | 'Umum'

export interface TipsTrik {
  /** Id unik, dipakai sebagai key React. */
  id: string
  kategori: TipsKategori
  /** Judul singkat, satu baris. */
  judul: string
  /** Isi tips, 2-4 kalimat bahasa Indonesia santai. */
  isi: string
  /** Ekspresi Osi di kartu tips ini. */
  mood: MascotMood
}

export const TIPS_TRIK: TipsTrik[] = [
  {
    id: 'twk-baca-pertanyaan-dulu',
    kategori: 'TWK',
    judul: 'Baca pertanyaannya dulu',
    isi: 'Soal TWK sering panjang, dengan cerita atau kutipan di awal. Baca kalimat pertanyaannya dulu supaya kamu tahu apa yang dicari, baru baca soalnya dengan fokus.',
    mood: 'kagum',
  },
  {
    id: 'twk-kata-mutlak',
    kategori: 'TWK',
    judul: 'Waspadai kata mutlak di opsi',
    isi: 'Opsi yang memakai kata seperti selalu, tidak pernah, atau semua patut dicurigai. Pernyataan yang terlalu mutlak sering jadi jebakan, kecuali memang sesuai dengan isi aturan yang kamu hafal.',
    mood: 'kagum',
  },
  {
    id: 'twk-hafal-isi-bukan-nomor',
    kategori: 'TWK',
    judul: 'Hafal isinya, bukan nomor pasalnya',
    isi: 'Soal UUD 1945 lebih sering menanyakan isi dan makna suatu pasal, bukan nomornya. Pahami dulu maksud tiap pasal, nomornya cukup dikenali saja.',
    mood: 'senang',
  },
  {
    id: 'twk-pancasila-dari-pengamalan',
    kategori: 'TWK',
    judul: 'Pancasila diuji dari pengamalannya',
    isi: 'Banyak soal TWK menyajikan situasi sehari-hari lalu menanyakan sila yang sesuai. Latih dirimu menghubungkan tiap sila dengan contoh nyata, bukan sekadar menghafal bunyinya.',
    mood: 'semangat',
  },
  {
    id: 'tiu-coret-dulu',
    kategori: 'TIU',
    judul: 'Coret opsi yang jelas salah',
    isi: 'Kalau jawaban langsungnya belum ketemu, buang dulu opsi yang jelas tidak mungkin. Dari lima opsi yang tinggal dua, peluang menebakmu jadi jauh lebih besar.',
    mood: 'semangat',
  },
  {
    id: 'tiu-hitung-kasar',
    kategori: 'TIU',
    judul: 'Hitung kasar dulu, baru hitung teliti',
    isi: 'Untuk soal hitung, coba taksir dulu dengan pembulatan. Sering kali taksiran saja sudah cukup untuk membuang opsi yang jauh, dan kamu tidak perlu menghitung sampai digit terakhir.',
    mood: 'kagum',
  },
  {
    id: 'tiu-kecukupan-data',
    kategori: 'TIU',
    judul: 'Kecukupan data: cek satu-satu',
    isi: 'Di soal kecukupan data, uji setiap pernyataan sendiri-sendiri dulu sebelum menggabungkannya. Kalau satu pernyataan saja sudah cukup untuk menjawab, tidak perlu memaksakan keduanya.',
    mood: 'kagum',
  },
  {
    id: 'tiu-deret-selisih',
    kategori: 'TIU',
    judul: 'Deret angka: cari selisihnya dulu',
    isi: 'Untuk deret, hitung dulu selisih antar suku yang berurutan. Kalau selisihnya belum berpola, coba selisih dari selisih itu, atau kelompokkan sukunya dua-dua.',
    mood: 'senang',
  },
  {
    id: 'tkp-paling-profesional',
    kategori: 'TKP',
    judul: 'Pilih yang paling profesional',
    isi: 'Jawaban ideal TKP biasanya yang paling profesional, etis, dan solutif, bukan yang paling aman atau paling enak. Bayangkan respons yang akan dibanggakan atasanmu.',
    mood: 'semangat',
  },
  {
    id: 'tkp-bayangkan-jadi-asn',
    kategori: 'TKP',
    judul: 'Bayangkan kamu sudah jadi ASN',
    isi: 'Saat ragu, tanyakan ke dirimu: apa yang akan dilakukan ASN yang baik di situasi ini? Cara pandang itu membantu memilih opsi yang paling sesuai dengan nilai dasar ASN.',
    mood: 'senang',
  },
  {
    id: 'tkp-jangan-menyalahkan',
    kategori: 'TKP',
    judul: 'Hindari jawaban yang menyalahkan orang lain',
    isi: 'Opsi yang menyalahkan rekan kerja, atasan, atau keadaan hampir tidak pernah jadi jawaban terbaik. Pilih respons yang mengambil tanggung jawab dan mencari jalan keluar.',
    mood: 'sedih',
  },
  {
    id: 'tkp-tidak-ada-salah',
    kategori: 'TKP',
    judul: 'Di TKP, semua opsi ada nilainya',
    isi: 'Opsi TKP dinilai bertingkat dari 1 sampai 5, jadi tidak ada jawaban yang nol hanya karena kurang ideal. Jangan pernah mengosongkan soal TKP, isi saja dengan pilihan terbaik menurutmu.',
    mood: 'kagum',
  },
  {
    id: 'umum-bagi-waktu',
    kategori: 'Umum',
    judul: 'Bagi waktu: sekitar 50 detik per soal',
    isi: 'Simulasi CAT memberi 100 menit untuk 110 soal, jadi rata-rata kamu hanya punya kurang dari satu menit per soal. Latih dirimu dengan timer supaya terbiasa dengan ritme itu.',
    mood: 'semangat',
  },
  {
    id: 'umum-lewati-dulu',
    kategori: 'Umum',
    judul: 'Soal susah dilewati dulu',
    isi: 'Kalau satu soal menyita waktu lebih dari satu menit, tandai dan lanjut ke soal berikutnya. Soal yang mudah di belakang sayang kalau tidak sempat dikerjakan hanya karena satu soal yang macet.',
    mood: 'senang',
  },
  {
    id: 'umum-tebak-daripada-kosong',
    kategori: 'Umum',
    judul: 'Tebak saja daripada kosong',
    isi: 'SKD tidak memakai nilai minus, jadi jawaban salah tidak mengurangi nilaimu. Di menit-menit akhir, isi semua soal yang masih kosong dengan tebakan terbaikmu.',
    mood: 'kagum',
  },
]
