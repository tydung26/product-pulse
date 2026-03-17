# Phase 1: Project Scaffolding

## Context Links
- [Brainstorm report](../reports/brainstorm-260317-2137-project-architecture.md)
- [Project brief](../../docs/v2-brief-focused-app-intelligence.md)

## Overview
- **Priority:** P1 — blocking all other phases
- **Status:** pending
- **Effort:** 3h
- **Description:** Initialize Next.js 16 project with Tailwind v4, shadcn/ui, tsx, and all dependencies. Configure tsconfig for path aliases shared between `src/` and `scripts/`.

## Key Insights
- Next.js 16 uses App Router with React 19 by default
- Tailwind v4 uses CSS-first config (no tailwind.config.js)
- tsx runs TS scripts directly with zero build step
- Path aliases must work for both Next.js and tsx scripts

## Requirements

### Functional
- Working `pnpm dev` with blank page
- All dependencies installed
- Path alias `@/` resolves from both Next.js and tsx

### Non-functional
- TypeScript strict mode
- ESLint basic config (Next.js default)

## Architecture
```
product-pulse/
├── src/app/layout.tsx          # Root layout (empty shell)
├── src/app/page.tsx            # Redirect to /apps
├── src/components/ui/          # shadcn/ui primitives
├── src/lib/utils.ts            # cn() helper
├── scripts/                    # Empty, ready for crawlers
├── .env.local                  # Template with placeholder keys
├── package.json
├── tsconfig.json
├── next.config.ts
└── postcss.config.mjs
```

## Related Code Files

### Create
- `package.json` — deps, pnpm scripts
- `tsconfig.json` — strict, path aliases (`@/` → `src/`)
- `next.config.ts` — minimal config
- `postcss.config.mjs` — Tailwind v4 plugin
- `src/app/globals.css` — Tailwind v4 imports + shadcn theme tokens
- `src/app/layout.tsx` — root layout with Inter font, metadata
- `src/app/page.tsx` — redirect to `/apps`
- `src/lib/utils.ts` — `cn()` utility (clsx + twMerge)
- `.env.local` — template: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
- `.gitignore` — node_modules, .next, .env.local
- `README.md` — project description + setup instructions

## Implementation Steps

1. **Init project with Next.js 16**
   ```bash
   pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   ```
   - Select: App Router, src directory, import alias `@/*`

2. **Verify Tailwind v4 setup**
   - Check `postcss.config.mjs` has `@tailwindcss/postcss`
   - Check `globals.css` uses `@import "tailwindcss"`
   - If v3 was installed, upgrade to v4 CSS-first approach

3. **Install core dependencies**
   ```bash
   pnpm add @supabase/supabase-js @supabase/ssr
   pnpm add -D tsx cheerio google-play-scraper @anthropic-ai/sdk
   pnpm add -D @types/cheerio
   ```

4. **Init shadcn/ui**
   ```bash
   pnpm dlx shadcn@latest init
   ```
   - Style: New York, base color: neutral, CSS variables: yes

5. **Install shadcn components** (core set for dashboard)
   ```bash
   pnpm dlx shadcn@latest add button card badge input select tabs skeleton separator table
   ```

6. **Configure tsconfig.json** — ensure paths work for scripts
   ```json
   {
     "compilerOptions": {
       "paths": { "@/*": ["./src/*"] },
       "strict": true,
       "baseUrl": "."
     }
   }
   ```

7. **Add pnpm scripts** to `package.json`
   ```json
   {
     "crawl:apps": "tsx scripts/crawlers/crawl-app-store.ts && tsx scripts/crawlers/crawl-google-play.ts && tsx scripts/crawlers/crawl-yc-launches.ts && tsx scripts/crawlers/crawl-product-hunt.ts && tsx scripts/crawlers/crawl-unikorn.ts",
     "crawl:appstore": "tsx scripts/crawlers/crawl-app-store.ts",
     "crawl:gplay": "tsx scripts/crawlers/crawl-google-play.ts",
     "crawl:yc": "tsx scripts/crawlers/crawl-yc-launches.ts",
     "crawl:ph": "tsx scripts/crawlers/crawl-product-hunt.ts",
     "crawl:unikorn": "tsx scripts/crawlers/crawl-unikorn.ts",
     "crawl:store_reviews": "tsx scripts/crawlers/crawl-store-reviews.ts",
     "analyze": "tsx scripts/ai/analyze.ts"
   }
   ```

8. **Create `.env.local`** template
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
   SUPABASE_SERVICE_ROLE_KEY=xxx
   ANTHROPIC_API_KEY=xxx
   ```

9. **Create placeholder dirs**
   ```
   scripts/crawlers/lib/
   scripts/ai/providers/
   ```

10. **Verify** — `pnpm dev` serves blank page at localhost:3000

## Todo List

- [ ] Init Next.js 16 project with App Router + src dir
- [ ] Verify Tailwind v4 CSS-first config
- [ ] Install Supabase, tsx, cheerio, google-play-scraper deps
- [ ] Init shadcn/ui (New York style, neutral)
- [ ] Install core shadcn components
- [ ] Configure tsconfig path aliases
- [ ] Add all pnpm scripts to package.json
- [ ] Create .env.local template
- [ ] Create placeholder directories for scripts
- [ ] Verify `pnpm dev` works

## Success Criteria
- `pnpm dev` runs without errors
- shadcn/ui components import correctly
- `tsx --version` works
- Path alias `@/lib/utils` resolves in both Next.js and standalone tsx

## Risk Assessment
- **Next.js 16 breaking changes**: Check latest docs if create-next-app defaults differ
- **Tailwind v4 + shadcn**: Ensure shadcn init generates v4-compatible CSS

## Next Steps
→ Phase 2: Database & Supabase setup
