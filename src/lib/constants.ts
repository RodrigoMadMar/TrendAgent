// Team member IDs for Notion
export const TEAM = {
  rodrigo: { id: "28bd872b-594c-8154-922c-0002229b861c", name: "Rodrigo Madariaga" },
  nicolas: { id: "2a3d872b-594c-8174-b6ac-0002c38dd99d", name: "Nicolás Cortés" },
  diego: { id: "c9eb1197-ba4a-4b71-a8c6-009c89e3c994", name: "Diego Cifuentes" },
  benjamin: { id: "993a9787-fe2a-4db8-a962-f734af30a0d9", name: "Benjamín Arriaza" },
  romina: { id: "83bbadb3-2926-46c0-bb6f-8bde196dfa43", name: "Romina Cortés" },
  felipe: { id: "d30bea6d-b525-4644-a760-455ec104c0fb", name: "Felipe Miranda" },
} as const;

// Notion database IDs
export const NOTION_DBS = {
  campanas: "3c49a0e2-5111-4dac-9a5d-d1292c7f8071",
  tareas: "8a9409d9-b945-463f-9a6c-9cdf2bd57c36",
  sprints: "5304dd35-6217-4252-afff-4116a124450f",
  negocios: "0cf41132-a344-4240-bd59-087b91339581",
} as const;

// Brand guidelines for scoring
export const BRAND = {
  pillars: ["Rapidez", "Confianza", "Accesibilidad", "Cercanía"],
  tone: "Cercano, directo, optimista",
  audience: ["PYMEs e-commerce", "Compradores online", "Emprendedores"],
  avoidances: ["Humor negro", "Política", "Contenido divisivo"],
  codes: {
    ENVIOGRATIS: "Primer envío gratis (adquisición)",
    BLUECOPEC20: "20% descuento (retención)",
  },
} as const;

// Channel → task generation mapping
export type TaskTemplate = {
  name: string;
  ownerKey: keyof typeof TEAM;
  tag: string;
  offsetDays: number;
};

export const CHANNEL_TASKS: Record<string, TaskTemplate[]> = {
  "Push + Email": [
    { name: "Nueva Base de Datos", ownerKey: "nicolas", tag: "segmentación", offsetDays: -3 },
    { name: "Diseño Nuevo Email", ownerKey: "benjamin", tag: "diseñoMail", offsetDays: -3 },
    { name: "JS", ownerKey: "diego", tag: "deploy_journeySpot", offsetDays: 0 },
  ],
  "Push": [
    { name: "Nueva Base de Datos", ownerKey: "nicolas", tag: "segmentación", offsetDays: -1 },
    { name: "ESP", ownerKey: "diego", tag: "deploy_envioSpot", offsetDays: 0 },
  ],
  "Email": [
    { name: "Nueva Base de Datos", ownerKey: "nicolas", tag: "segmentación", offsetDays: -3 },
    { name: "Diseño Nuevo Email", ownerKey: "benjamin", tag: "diseñoMail", offsetDays: -3 },
    { name: "ESM", ownerKey: "diego", tag: "deploy_envioSpot", offsetDays: 0 },
  ],
  "Paid Social": [
    { name: "Nueva Base de Datos", ownerKey: "nicolas", tag: "segmentación", offsetDays: -5 },
    { name: "Diseño Piezas RRSS", ownerKey: "benjamin", tag: "diseñoGrilla", offsetDays: -5 },
    { name: "Publicación Paid Media", ownerKey: "romina", tag: "mediosPagos", offsetDays: 0 },
  ],
  "Full funnel": [
    { name: "Nueva Base de Datos", ownerKey: "nicolas", tag: "segmentación", offsetDays: -5 },
    { name: "Diseño Nuevo Email", ownerKey: "benjamin", tag: "diseñoMail", offsetDays: -5 },
    { name: "JS", ownerKey: "diego", tag: "deploy_journeySpot", offsetDays: 0 },
    { name: "Publicación Paid Media", ownerKey: "romina", tag: "mediosPagos", offsetDays: 0 },
  ],
  "Instagram + TikTok": [
    { name: "Diseño Piezas RRSS", ownerKey: "benjamin", tag: "diseñoGrilla", offsetDays: -3 },
    { name: "Publicación Paid Media", ownerKey: "romina", tag: "mediosPagos", offsetDays: 0 },
  ],
};

export function getTasksForChannel(channel: string): TaskTemplate[] {
  const key = Object.keys(CHANNEL_TASKS).find((k) =>
    channel.toLowerCase().includes(k.toLowerCase())
  ) || "Push";
  return CHANNEL_TASKS[key] || CHANNEL_TASKS["Push"];
}

export function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Competitors
export const COMPETITORS = [
  { name: "Chilexpress", x: "@Chilexpress", ig: "@chilexpress", color: "#FF6B00" },
  { name: "Starken", x: "@StarkenCL", ig: "@starkencl", color: "#E31837" },
  { name: "Correos de Chile", x: "@Correos_Chile", ig: "@correos.chile", color: "#003DA5" },
] as const;

// Types
export interface RawTrend {
  title: string;
  source: string;
  category: string;
  summary: string;
}

export interface Campaign {
  id: string;
  title: string;
  channel: string;
  copy: string;
  cta: string;
  estimatedReach: string;
  votes: number;
}

export interface ScoredTrend {
  id: number;
  title: string;
  source: string;
  sourceIcon: string;
  category: string;
  summary: string;
  relevanceScore: number;
  viralScore: number;
  brandFitScore: number;
  timingWindow: string;
  effort: "S" | "M" | "L";
  volume: number;
  velocity: string;
  timestamp: string;
  campaigns: Campaign[];
}

export interface CompetitorPost {
  competitor: string;
  platform: string;
  type: string;
  summary: string;
  copy: string | null;
  engagement: "alto" | "medio" | "bajo";
  date: string;
  opportunity: string | null;
}

export interface CompetitiveOpportunity {
  title: string;
  trigger: string;
  suggestion: string;
  urgency: "alta" | "media" | "baja";
  channel: string;
}

export interface CompetitorSummary {
  name: string;
  activityLevel: "alto" | "medio" | "bajo";
  mainFocus: string;
  promos: string[];
  toneShift: string | null;
  posts: CompetitorPost[];
}

export interface CompetitorAnalysis {
  competitors: CompetitorSummary[];
  opportunities: CompetitiveOpportunity[];
  summary: string;
}

export interface MetaAd {
  id: string;
  advertiser: string;
  copy: string;
  cta: string | null;
  platform: string;
  creativeType: string;
  activeFrom: string | null;
}

export interface MetaAdsCompetitorResult {
  competitor: string;
  ads: MetaAd[];
  screenshotB64: string | null;
  scannedAt: string;
  error?: string;
}
