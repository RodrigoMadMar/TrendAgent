# Trend Scout Agent — Blue Express

Agente de análisis de tendencias para campañas reactivas de Blue Express.
Scrapea tendencias reales de X Chile y farándula, las scorea con Claude contra el manual de marca, y pushea campañas a Notion.

## Stack

- **Next.js 15** (App Router)
- **Anthropic Claude API** (web_search + scoring)
- **Notion MCP** (creación de campañas y tareas)
- **Vercel** (hosting)

## Arquitectura

```
Browser → Next.js Page (React)
              ↓
         /api/scan    → Claude + web_search → trending topics Chile
         /api/score   → Claude scoring → brand fit + campaign ideas
         /api/notion  → Claude + Notion MCP → crea campaña + tareas
```

La API key de Anthropic NUNCA se expone al cliente. Todas las llamadas pasan por API routes server-side.

## Setup

### 1. Clonar e instalar

```bash
git clone <repo>
cd trend-scout
npm install
```

### 2. Configurar environment

```bash
cp .env.example .env.local
```

Editar `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-tu-key-aqui
```

### 3. Correr local

```bash
npm run dev
```

Abrir http://localhost:3000

### 4. Deploy a Vercel

```bash
npx vercel
```

O conectar el repo en vercel.com y agregar `ANTHROPIC_API_KEY` en Settings → Environment Variables.

## Estructura

```
src/
├── app/
│   ├── layout.tsx          # Root layout con fonts
│   ├── page.tsx            # Dashboard principal (client component)
│   └── api/
│       ├── scan/route.ts   # Scraping de tendencias via Claude web_search
│       ├── score/route.ts  # Scoring + generación de ideas via Claude
│       └── notion/route.ts # Push a Notion via Claude MCP
└── lib/
    ├── anthropic.ts        # Singleton del Anthropic SDK
    └── constants.ts        # Team, DBs, brand config, task mapping
```

## Flujo del usuario

1. Click "Escanear tendencias"
2. `/api/scan` usa Claude con web_search para buscar trends reales
3. `/api/score` analiza cada trend contra el manual de marca Blue Express
4. Dashboard muestra resultados con scoring triple (Relevancia, Viral, Brand Fit)
5. Usuario vota propuestas favoritas
6. Click "Crear en Notion" → modal pide Sprint + Deploy date
7. `/api/notion` crea campaña + tareas en Notion via MCP

## Fuentes de datos

- **X/Twitter Chile**: via web search de trending topics
- **LimaLimón**: noticias de farándula chilena
- **Farándula Chile**: búsqueda general de entretenimiento

## Configuración de marca (editable en constants.ts)

- Pilares: Rapidez, Confianza, Accesibilidad, Cercanía
- Tono: Cercano, directo, optimista
- Códigos: ENVIOGRATIS, BLUECOPEC20
- Evitar: Humor negro, Política, Contenido divisivo

## Task mapping (de tu Growth Campaign Factory skill)

Cada canal de campaña genera automáticamente las tareas correctas:
- Push + Email → Base datos (Nico) + Diseño email (Benja) + JS (Diego)
- Paid Social → Base datos (Nico) + Diseño RRSS (Benja) + Paid (Romina)
- Full funnel → Todos los anteriores
- Siempre incluye Análisis KPIs (Felipe) al final

## Próximos pasos

- [ ] Cron job para escaneo diario automático (Vercel Cron)
- [ ] Persistencia de votos (Vercel KV o Supabase)
- [ ] Slack notifications al crear campaña
- [ ] Historial de tendencias anteriores
- [ ] Filtro por fecha y fuente específica
