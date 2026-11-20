# Lolosin

Studying for the CPNS exam is a grind. Lolosin makes it feel like a game
you actually want to open every day.

Lolosin is a gamified study app for Indonesia's civil service entrance
exam (CPNS). It packs everything you need in one place: readable study
material, thousands of practice questions with clear explanations, and
full exam simulations with the real passing grades. Streaks, a mascot
companion, battles, and a weekly leaderboard keep you going when
motivation runs out.

**Try it live:** https://lolosin.netlify.app/ (works as a PWA, and works
offline once loaded)

## Why people stick with it

Most CPNS apps are question banks with a login screen. Lolosin is built
around one idea: you learn more when you actually show up every day. So
everything is designed to make showing up easy and fun.

- **Material that reads well.** 21 study documents, 308 sections, about
  87,000 words, written to be read, not skimmed. Every section ends with
  key takeaways, and each subtest has a cheat sheet up front.
- **Questions that teach, not just test.** 9,247 questions, and every
  quiz-usable one explains each option, so you understand why an answer
  is right and why the others are wrong. Questions never repeat until
  you have seen the whole pool.
- **Real exam practice.** Full CAT simulation (110 questions, 100
  minutes) scored against the official passing grades, plus a weekly
  live tryout every Sunday morning.
- **Game mechanics that work.** Daily streaks, XP and levels, badges, a
  mascot pet that grows with your streak, 1v1 battles against friends,
  and a weekly leaderboard.
- **Study help that adapts to you.** Wrong answers come back on a spaced
  schedule, a personal study plan points at your weak spots, and an
  interactive weakness map shows exactly where to focus next.

## Features

- Belajar: structured SKD material (TWK, TIU, TKP) with key takeaways,
  tables, and diagrams
- Latihan: per-topic drills with per-option explanations, no repeats
- Tryout: mini CAT (30 questions) and full simulation (110 questions),
  weekly Tryout Akbar
- Gamification: streaks, XP, levels, badges, mascot pet (Osi), weekly
  leaderboard with champion rewards
- Play: real-time 1v1 battles, Quizizz-style group sessions, five solo
  mini-games, discussion on every question
- Planning: spaced repetition, personal study plan, pass prediction,
  weakness map
- Formasi browser: browse CPNS formations with official SSCASN links
  (sample data, clearly labeled)

## Built with

Vite, React 19, TypeScript, Tailwind CSS v4, PWA. Backend on Supabase
(Auth, Postgres, Realtime, Edge Functions, scheduled jobs). Hosted on
Netlify.

AI-assisted development: the author makes the product, design, content,
and quality calls, and works with an AI coding assistant on
implementation. Every release passes a 796-check local QA suite before
it ships.

## Run it locally

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

For auth, leaderboard, and progress sync, add your Supabase credentials
to `.env` (see `.env.contoh`). Without them the app runs in local-only
mode.

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
```

## Project layout

```
src/
  data/
    questions/       # question bank, split into chunks
    materi/          # study material (index + documents + build script)
  lib/               # question loader, quiz engine, store, sync, auth,
                     # redeem codes, battle logic, gamification
  components/        # layout, quiz UI, mascot, share cards, notifications
  pages/             # Home, Belajar, Latihan, Tryout, games, leaderboard,
                     # formations, profile, weakness map, tips
supabase/
  migrations/        # profiles, leaderboard, battles, premium, redeem
                     # codes, progress sync, discussions, winner emails
  functions/         # winner-code email (Resend)
```

## Question bank notes

- The bank is split into chunks and loaded with `import.meta.glob`, so
  chunk names and counts can change without touching code. It ships as a
  separate `questions-[hash].js` chunk, precached by the service worker.
- Questions without a verified key (`kunci: null`) never appear in
  quizzes. Defective questions are removed, not kept.
- Sources are free-access materials. Keys and explanations are verified
  before they ship.

## Roadmap

- Admin panel (users, redeem codes, weekly winners, bank summary)
- Your own rank on the leaderboard page
- SKB material (final phase)

## License

Proprietary. All rights reserved. This code is not open source.
