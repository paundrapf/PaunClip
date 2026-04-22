# FRONTEND KNOWLEDGE BASE

## OVERVIEW
Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4 web frontend. Backed by the FastAPI server at `../server.py`.

## STRUCTURE
```
frontend/
├── app/              # Next.js app router
│   ├── page.tsx      # Home / workspace landing
│   ├── layout.tsx    # Root layout (Geist fonts, AppShell)
│   ├── globals.css   # Tailwind v4 theme tokens
│   ├── campaigns/    # Campaign queue UI
│   ├── manual/       # Manual session creation
│   ├── sessions/     # Session browser / resume
│   ├── library/      # Outputs browser
│   ├── settings/     # Settings pages
│   └── help/         # Help pages
├── components/       # Shared React components
├── hooks/            # Custom hooks
├── lib/              # Utilities / API clients
├── public/           # Static assets
└── types/            # Shared TypeScript types
```

## COMMANDS
```bash
npm run dev        # Start dev server (expects API at 127.0.0.1:8000)
npm run build      # Production build
npm run start      # Serve production build
npm run lint       # ESLint (Next.js core-web-vitals + typescript)
npm run typecheck  # tsc --noEmit
```

## CONVENTIONS
- TypeScript `strict: true`. No JS files (`allowJs: false`).
- Import alias `@/*` maps to `./*`.
- Tailwind CSS v4 via `@tailwindcss/postcss`; theme tokens live in `globals.css` using `@theme inline`.
- `next.config.ts` sets Turbopack root explicitly.
- ESLint extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.

## ANTI-PATTERNS
- This is Next.js 16 with breaking changes; do not assume APIs from older Next.js training data.
- Do not add vanilla JS files; the TS config rejects them.
- Do not deploy to Vercel alone; the app requires the FastAPI backend for full functionality.
- Keep API base URL at `http://127.0.0.1:8000` unless explicitly changed via env.

## NOTES
- `AppShell` in `components/layout/app-shell` wraps the entire app.
- Dark-first UI; tokens are defined in `globals.css` (background, foreground, panel, stroke, accent, etc.).
