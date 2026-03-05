# CLAUDE.md — Trend Scout Agent

## Project Overview

This is a Next.js 15 app (App Router) that serves as a real-time trend monitoring dashboard for Blue Express (logistics/shipping service, part of Copec Chile).

## Key Commands

```bash
npm run dev     # Start dev server on localhost:3000
npm run build   # Production build
npm run start   # Start production server
```

## Architecture

- **Frontend**: Single-page React dashboard at `src/app/page.tsx` (client component)
- **Backend**: Three API routes as server-side proxies to Anthropic API
  - `/api/scan` — Uses Claude + web_search tool to fetch live Chilean trends
  - `/api/score` — Uses Claude to score trends against Blue Express brand guidelines
  - `/api/notion` — Uses Claude + Notion MCP to create campaigns and tasks

## Important Files

- `src/lib/constants.ts` — All shared config: team IDs, Notion DB IDs, brand guidelines, channel-to-task mapping
- `src/lib/anthropic.ts` — Anthropic SDK singleton (uses `ANTHROPIC_API_KEY` env var)
- `.env.local` — Must contain `ANTHROPIC_API_KEY=sk-ant-...`

## Design Decisions

1. **No separate CSS files** — All styling is inline for simplicity
2. **No database** — Votes are client-side state only (future: add Vercel KV)
3. **Notion MCP** — Campaign creation uses Claude as intermediary via MCP servers, not direct Notion API
4. **Mobile-first** — Max-width 720px, responsive paddings

## Brand Context (Blue Express)

This is critical context for scoring. Blue Express is a shipping service targeting Chilean SMBs and online shoppers. The brand tone is warm, direct, and optimistic. Active promo codes: ENVIOGRATIS (free first shipment), BLUECOPEC20 (20% off).

## Team Members (Notion assignments)

- Rodrigo Madariaga — Campaign lead (Blue Express)
- Nicolás Cortés — Data/segmentation
- Benjamín Arriaza — Design
- Diego Cifuentes — Journey/automation (SFMC)
- Romina Cortés — Paid media
- Felipe Miranda — KPI analysis

## Deployment

Target: Vercel. Set `ANTHROPIC_API_KEY` in Vercel Environment Variables. Functions use `maxDuration = 60` (or 120 for Notion).
