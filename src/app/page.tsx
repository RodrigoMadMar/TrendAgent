"use client";

import { useState } from "react";
import { BRAND, COMPETITORS, TEAM, getTasksForChannel, offsetDate } from "@/lib/constants";
import type { ScoredTrend, Campaign, CompetitorAnalysis, CompetitorPost, CompetitiveOpportunity, MetaAd, MetaAdsCompetitorResult } from "@/lib/constants";

/* ═══════════════════ API CALLS ═══════════════════ */

async function apiScan(): Promise<{ twitter: ScoredTrend[]; google: ScoredTrend[] }> {
  const res = await fetch("/api/scan", { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { twitter: data.twitter || [], google: data.google || [] };
}

async function apiNotion(payload: any): Promise<any> {
  const res = await fetch("/api/notion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function apiMetaAds(): Promise<MetaAdsCompetitorResult[]> {
  const res = await fetch("/api/meta-ads", { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.results || [];
}

async function apiCompetitors(): Promise<CompetitorAnalysis> {
  const res = await fetch("/api/competitors", { method: "POST" });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Error al escanear competidores. Reintenta en unos segundos."); }
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiBrandPulse(): Promise<BrandPulseResult> {
  const res = await fetch("/api/brand-pulse", { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiAppReviews(): Promise<AppReviewsResult> {
  const res = await fetch("/api/app-reviews", { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ── Types for new modules ── */
interface BrandData { name: string; score: number; trend: "up" | "down" | "stable"; color: string; }
interface BrandPulseResult {
  brands: BrandData[];
  relatedQueries: { query: string; growth: string }[];
  timelinePoints: { date: string; values: number[] }[];
  insight: string;
  source: string;
  scannedAt: string;
}
interface AppReview { text: string; rating: number; date: string; sentiment: "positivo" | "negativo" | "neutro"; }
interface AppData {
  name: string; rating: number; totalReviews: string;
  recentSentiment: "positivo" | "mixto" | "negativo";
  topIssues: string[]; topPraises: string[];
  recentReviews: AppReview[];
}
interface AppReviewsResult { apps: AppData[]; insight: string; opportunity: string; scannedAt: string; }

/* ═══════════════════ DESIGN TOKENS ═══════════════════ */

const T = {
  bg:       "#07090d",
  surface:  "#0c1018",
  card:     "#101520",
  border:   "rgba(255,255,255,0.07)",
  borderHi: "rgba(255,255,255,0.12)",
  txt1:     "#e8eaf0",
  txt2:     "#8b92a5",
  txt3:     "#454d5e",
  blue:     "#1d6bf5",
  blueHi:   "#4d8fff",
  green:    "#00d68f",
  orange:   "#f59e0b",
  red:      "#f87171",
  twitter:  "#1d9bf0",
  google:   "#34d399",
  meta:     "#1877f2",
  mono:     "'JetBrains Mono', 'Courier New', monospace",
};

const CHANNEL_STYLES: Record<string, { color: string; icon: string }> = {
  "Email":              { color: "#a78bfa", icon: "✉️" },
  "Push":               { color: "#38bdf8", icon: "🔔" },
  "Push + Email":       { color: "#818cf8", icon: "🔔✉️" },
  "Instagram Post":     { color: "#f472b6", icon: "📷" },
  "Instagram Story":    { color: "#fb923c", icon: "📸" },
  "Instagram + TikTok": { color: "#e879f9", icon: "📲" },
  "TikTok":             { color: "#2dd4bf", icon: "🎵" },
  "Paid Social":        { color: "#facc15", icon: "💰" },
  "SMS":                { color: "#4ade80", icon: "💬" },
  "Full funnel":        { color: "#f87171", icon: "🎯" },
};

const COMPETITOR_COLORS: Record<string, string> = {
  "Chilexpress": "#FF6B00",
  "Starken": "#E31837",
  "Correos de Chile": "#003DA5",
};

const URGENCY_COLORS: Record<string, string> = {
  "alta": "#f87171",
  "media": "#f59e0b",
  "baja": "#34d399",
};

/* ═══════════════════ MICRO COMPONENTS ═══════════════════ */

const Dot = ({ color = T.green }: { color?: string }) => (
  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 700, color: T.txt3, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: T.mono }}>
    {children}
  </span>
);

const Badge = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span style={{
    fontSize: 9, fontWeight: 700, color,
    background: `${color}18`, padding: "2px 8px",
    borderRadius: 4, border: `1px solid ${color}30`,
    fontFamily: T.mono, whiteSpace: "nowrap",
  }}>{children}</span>
);

const ScoreBar = ({ score, label, color }: { score: number; label: string; color: string }) => {
  const s = typeof score === "number" && !isNaN(score) ? score : 0;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Label>{label}</Label>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: T.mono }}>{s}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${s * 10}%`, background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
};

const EffortTag = ({ effort }: { effort: string }) => {
  const c = { S: { l: "Quick Win", c: T.green }, M: { l: "Medio", c: T.orange }, L: { l: "Campaña", c: "#f97316" } }[effort] || { l: effort, c: "#888" };
  return <Badge color={c.c}>{c.l}</Badge>;
};

const ChannelTag = ({ channel }: { channel: string }) => {
  const s = CHANNEL_STYLES[channel] || { color: "#888", icon: "📡" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: s.color, background: `${s.color}18`, padding: "2px 8px", borderRadius: 4, border: `1px solid ${s.color}30`, whiteSpace: "nowrap" }}>
      {channel}
    </span>
  );
};

const VoteBtn = ({ votes, onVote, voted }: { votes: number; onVote: () => void; voted: boolean }) => (
  <button onClick={(e) => { e.stopPropagation(); onVote(); }} style={{
    display: "flex", alignItems: "center", gap: 4,
    background: voted ? `${T.blue}20` : "rgba(255,255,255,0.03)",
    border: voted ? `1px solid ${T.blue}60` : `1px solid ${T.border}`,
    borderRadius: 6, padding: "5px 10px", cursor: "pointer",
    color: voted ? T.blueHi : T.txt3, fontSize: 11, fontWeight: 700, fontFamily: T.mono,
  }}>
    <span>{voted ? "▲" : "△"}</span><span>{votes + (voted ? 1 : 0)}</span>
  </button>
);

const AvgRing = ({ avg }: { avg: string }) => {
  const s = parseFloat(avg) || 0;
  const color = s >= 8 ? T.green : s >= 6 ? T.orange : T.red;
  return (
    <div style={{
      width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
      background: `conic-gradient(${color} ${(s / 10) * 360}deg, rgba(255,255,255,0.04) 0deg)`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", background: T.card,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 800, color, fontFamily: T.mono,
      }}>{s}</div>
    </div>
  );
};

/* ═══════════════════ PANEL WRAPPER ═══════════════════ */

function Panel({ accent, header, children }: {
  accent: string;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${accent}25`,
      borderTop: `2px solid ${accent}`,
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${accent}15`,
        background: `${accent}06`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      }}>
        {header}
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════ NOTION MODAL ═══════════════════ */

function NotionModal({ campaign, trend, onClose }: { campaign: Campaign; trend: ScoredTrend; onClose: () => void }) {
  const [sprint, setSprint] = useState("");
  const [deploy, setDeploy] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const tasks = getTasksForChannel(campaign.channel);

  const go = async () => {
    if (!sprint || !deploy) return;
    setStatus("loading");
    try {
      const res = await apiNotion({ campaign, trend, sprint, deployDate: deploy });
      setStatus(res.success ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`,
    borderRadius: 7, color: T.txt1, fontSize: 13, outline: "none",
    boxSizing: "border-box", marginBottom: 12, fontFamily: T.mono,
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 3px", color: T.txt1 }}>Crear en Notion</h2>
            <p style={{ fontSize: 10, color: T.blue, margin: 0, fontWeight: 600, fontFamily: T.mono }}>Rodrigo Madariaga · Campaign Lead</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.txt3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ background: `${T.blue}08`, border: `1px solid ${T.blue}18`, borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.txt1, marginBottom: 3 }}>📦 {campaign.title}</div>
          <div style={{ fontSize: 10, color: T.txt2 }}>Tendencia: {trend.title}</div>
          <p style={{ fontSize: 11, color: T.txt2, fontStyle: "italic", margin: "6px 0 0" }}>&quot;{campaign.copy}&quot;</p>
        </div>

        <label style={{ display: "block", fontSize: 10, color: T.txt2, fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8 }}>Sprint *</label>
        <input placeholder="Ej: Sprint 66" value={sprint} onChange={(e) => setSprint(e.target.value)} style={inputStyle} />

        <label style={{ display: "block", fontSize: 10, color: T.txt2, fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8 }}>Fecha deploy *</label>
        <input type="date" value={deploy} onChange={(e) => setDeploy(e.target.value)} style={inputStyle} />

        {tasks.length > 0 && status === "idle" && (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 7, padding: 10, marginBottom: 14, border: `1px solid ${T.border}` }}>
            <Label>Tareas a crear ({tasks.length})</Label>
            {tasks.map((task, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < tasks.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: 10, color: T.txt2, flex: 1 }}>{task.name}</span>
                <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>{task.ownerKey}</span>
                <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>{deploy ? offsetDate(deploy, task.offsetDays) : `+${task.offsetDays}d`}</span>
              </div>
            ))}
          </div>
        )}

        {status === "idle" && (
          <button onClick={go} disabled={!sprint || !deploy} style={{
            width: "100%", padding: "11px", borderRadius: 8, border: "none",
            background: sprint && deploy ? T.blue : "rgba(255,255,255,0.05)",
            color: sprint && deploy ? "#fff" : T.txt3,
            fontSize: 13, fontWeight: 700, cursor: sprint && deploy ? "pointer" : "not-allowed",
          }}>Crear Campaña + Tareas</button>
        )}
        {status === "loading" && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⏳</div>
            <div style={{ fontSize: 12, color: T.blue, fontWeight: 600 }}>Creando en Notion vía Claude MCP...</div>
          </div>
        )}
        {status === "success" && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.green }}>Creado en Notion</div>
            <button onClick={onClose} style={{ marginTop: 10, padding: "7px 20px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: T.txt2, fontSize: 11, cursor: "pointer" }}>Cerrar</button>
          </div>
        )}
        {status === "error" && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 12, color: T.red }}>Error al crear</div>
            <button onClick={() => setStatus("idle")} style={{ marginTop: 10, padding: "7px 20px", borderRadius: 7, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: T.txt2, fontSize: 11, cursor: "pointer" }}>Reintentar</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ CAMPAIGN CARD ═══════════════════ */

function CampaignCard({ c, trend, voted, onVote, onCreate }: {
  c: Campaign; trend: ScoredTrend; voted: boolean; onVote: () => void; onCreate: (c: Campaign, t: ScoredTrend) => void;
}) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: T.txt1 }}>{c.title}</span>
            <ChannelTag channel={c.channel} />
          </div>
          <p style={{ fontSize: 11, color: T.txt2, margin: "0 0 4px", lineHeight: 1.45, fontStyle: "italic" }}>&quot;{c.copy}&quot;</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {c.cta && <span style={{ fontSize: 9, fontWeight: 700, color: T.blue, background: `${T.blue}12`, padding: "2px 8px", borderRadius: 4 }}>CTA: {c.cta}</span>}
            {c.estimatedReach && <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>≈{c.estimatedReach}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <VoteBtn votes={c.votes} onVote={onVote} voted={voted} />
          <button onClick={(e) => { e.stopPropagation(); onCreate(c, trend); }} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "5px 10px", borderRadius: 6, cursor: "pointer",
            background: `${T.green}0d`, border: `1px solid ${T.green}30`,
            color: T.green, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap",
          }}>📋 Notion</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ TREND CARD ═══════════════════ */

function TrendCard({ t, open, toggle, votes, onVote, onCreate }: {
  t: ScoredTrend; open: boolean; toggle: () => void; votes: Set<string>; onVote: (id: string) => void; onCreate: (c: Campaign, t: ScoredTrend) => void;
}) {
  const avg = (((t.relevanceScore || 0) + (t.viralScore || 0) + (t.brandFitScore || 0)) / 3).toFixed(1);
  const avgNum = parseFloat(avg);
  const borderColor = avgNum >= 8 ? T.green : avgNum >= 6 ? T.orange : T.red;

  return (
    <div style={{
      background: T.card, borderRadius: 8, overflow: "hidden", marginBottom: 8,
      border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${borderColor}`,
      boxShadow: open ? "0 4px 24px rgba(0,0,0,0.35)" : "none",
    }}>
      <div onClick={toggle} style={{ padding: "11px 12px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <AvgRing avg={avg} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: T.txt1, margin: "0 0 4px", lineHeight: 1.25 }}>{t.title}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <EffortTag effort={t.effort || "M"} />
              {t.source === "Google Trends" && <Badge color={T.google}>Búsqueda activa</Badge>}
              <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>{t.timingWindow}</span>
              <span style={{ fontSize: 9, color: T.txt3 }}>{t.timestamp}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.mono }}>🔥 {((t.volume || 0) / 1000).toFixed(1)}K</span>
            <span style={{ fontSize: 10, color: T.green, fontWeight: 700, fontFamily: T.mono }}>{t.velocity}</span>
            <span style={{ color: T.txt3, fontSize: 10, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "0.2s" }}>▾</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <ScoreBar score={t.relevanceScore} label="Relev" color={T.blue} />
          <ScoreBar score={t.viralScore} label="Viral" color={T.orange} />
          <ScoreBar score={t.brandFitScore} label="Brand" color={T.green} />
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${T.border}` }}>
          <p style={{ fontSize: 11, color: T.txt2, lineHeight: 1.55, margin: "10px 0 10px" }}>{t.summary}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: `${T.blue}08`, borderRadius: 6, border: `1px solid ${T.blue}15`, marginBottom: 10 }}>
            <span style={{ fontSize: 10 }}>⏱</span>
            <span style={{ fontSize: 10, color: T.blueHi, fontWeight: 600 }}>Ventana: {t.timingWindow}</span>
            <span style={{ fontSize: 10, color: T.txt3 }}>· {(t.campaigns || []).length} propuestas</span>
          </div>
          <Label>Propuestas de Campaña</Label>
          {(t.campaigns || []).map((c) => (
            <CampaignCard key={c.id} c={c} trend={t} voted={votes.has(c.id)} onVote={() => onVote(c.id)} onCreate={onCreate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ COMPETITOR COMPONENTS ═══════════════════ */

function CompetitorPostCard({ post }: { post: CompetitorPost }) {
  const color = COMPETITOR_COLORS[post.competitor] || "#888";
  const PLATFORM_ICONS: Record<string, string> = { "Facebook": "📘", "Instagram": "📷", "X": "𝕏" };
  const engColor = { alto: T.green, medio: T.orange, bajo: T.red }[post.engagement] || "#888";
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 7, padding: "9px 10px", marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{PLATFORM_ICONS[post.platform] || "📡"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
            <Badge color={color}>{post.platform}</Badge>
            <Badge color={T.txt3}>{post.type}</Badge>
            <span style={{ fontSize: 8, fontWeight: 700, color: engColor, fontFamily: T.mono }}>● {post.engagement}</span>
            <span style={{ fontSize: 8, color: T.txt3 }}>{post.date}</span>
          </div>
          <p style={{ fontSize: 11, color: T.txt2, margin: "0 0 4px", lineHeight: 1.4 }}>{post.summary}</p>
          {post.copy && <p style={{ fontSize: 10, color: T.txt3, fontStyle: "italic", margin: "0 0 4px" }}>&quot;{post.copy}&quot;</p>}
          {post.opportunity && (
            <div style={{ fontSize: 9, color: T.blueHi, background: `${T.blue}08`, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.blue}18`, marginTop: 4 }}>
              💡 {post.opportunity}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({ opp, onNotion }: { opp: CompetitiveOpportunity; onNotion: () => void }) {
  const urgencyColor = URGENCY_COLORS[opp.urgency] || "#888";
  return (
    <div style={{ background: T.card, border: `1px solid ${T.blue}18`, borderLeft: `3px solid ${urgencyColor}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.txt1 }}>{opp.title}</span>
            <Badge color={urgencyColor}>urgencia {opp.urgency}</Badge>
          </div>
          <p style={{ fontSize: 10, color: T.txt3, margin: "0 0 3px", fontFamily: T.mono }}>trigger: {opp.trigger}</p>
          <p style={{ fontSize: 11, color: T.txt2, margin: 0, lineHeight: 1.4 }}>{opp.suggestion}</p>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
          <ChannelTag channel={opp.channel} />
          <button onClick={onNotion} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: `${T.green}0d`, border: `1px solid ${T.green}30`, color: T.green, fontSize: 9, fontWeight: 700 }}>
            📋 Notion
          </button>
        </div>
      </div>
    </div>
  );
}

function CompetitorCard({ comp, open, toggle, screenshots, onScreenshot }: {
  comp: any; open: boolean; toggle: () => void;
  screenshots?: { platform: string; screenshotB64: string }[];
  onScreenshot?: (b64: string) => void;
}) {
  const color = COMPETITOR_COLORS[comp.name] || "#888";
  const activityColor = { alto: T.green, medio: T.orange, bajo: T.red }[comp.activityLevel as string] || "#888";
  return (
    <div style={{ background: T.card, border: `1px solid ${color}25`, borderRadius: 9, overflow: "hidden", marginBottom: 10 }}>
      <div onClick={toggle} style={{ padding: "11px 13px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 7, flexShrink: 0, background: `${color}15`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
            {comp.name === "Chilexpress" ? "🟠" : comp.name === "Starken" ? "🔴" : "🔵"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.txt1 }}>{comp.name}</span>
              <Badge color={activityColor}>actividad {comp.activityLevel}</Badge>
            </div>
            <p style={{ fontSize: 10, color: T.txt2, margin: 0, lineHeight: 1.3 }}>{comp.mainFocus}</p>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.txt3, fontFamily: T.mono }}>{(comp.posts || []).length} posts</div>
            <span style={{ color: T.txt3, fontSize: 10, transform: open ? "rotate(180deg)" : "rotate(0)", display: "block", transition: "0.2s" }}>▾</span>
          </div>
        </div>
        {comp.promos?.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 7 }}>
            {comp.promos.map((p: string, i: number) => (
              <Badge key={i} color={T.orange}>🏷 {p}</Badge>
            ))}
          </div>
        )}
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {(screenshots || []).length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${(screenshots || []).length}, 1fr)`, gap: 6, padding: "10px 13px 6px" }}>
              {(screenshots || []).map(s => (
                <div key={s.platform} style={{ cursor: "zoom-in" }} onClick={(e) => { e.stopPropagation(); onScreenshot?.(s.screenshotB64); }}>
                  <div style={{ fontSize: 8, color: T.txt3, marginBottom: 3, fontWeight: 600 }}>📘 Facebook</div>
                  <div style={{ position: "relative", overflow: "hidden", borderRadius: 6, border: `1px solid ${color}20` }}>
                    <img src={`data:image/jpeg;base64,${s.screenshotB64}`} alt={`${comp.name} ${s.platform}`}
                      style={{ width: "100%", display: "block", maxHeight: 120, objectFit: "cover", objectPosition: "top" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.5))", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 4 }}>
                      <span style={{ fontSize: 7, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 5px", borderRadius: 3 }}>🔍 Ver</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "0 13px 13px" }}>
            {comp.toneShift && (
              <div style={{ fontSize: 10, color: "#f97316", background: "rgba(249,115,22,0.06)", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(249,115,22,0.15)", marginBottom: 8 }}>
                ⚡ Cambio de tono: {comp.toneShift}
              </div>
            )}
            {(comp.posts || []).length === 0 && (
              <p style={{ fontSize: 11, color: T.txt3, margin: 0, fontStyle: "italic" }}>Sin publicaciones recientes detectadas.</p>
            )}
            {(comp.posts || []).map((post: CompetitorPost, i: number) => (
              <CompetitorPostCard key={i} post={post} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TREND PANEL ═══════════════════ */

function TrendPanel({
  title, icon, accent, subtitle,
  phase, msg, trends, expanded, votes,
  onScan, onToggle, onVote, onCreate,
}: {
  title: string; icon: string; accent: string; subtitle: string;
  phase: string; msg: string;
  trends: ScoredTrend[]; expanded: number | null; votes: Set<string>;
  onScan: () => void;
  onToggle: (id: number) => void;
  onVote: (id: string) => void;
  onCreate: (c: Campaign, t: ScoredTrend) => void;
}) {
  const isLoading = phase === "fetching" || phase === "scoring";
  const btnLabel = phase === "idle" ? "Escanear" : isLoading ? (phase === "fetching" ? "📡 Buscando..." : "🧠 Scoring...") : phase === "error" ? "🔄 Reintentar" : "🔄 Actualizar";

  return (
    <Panel accent={accent} header={
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {phase === "done" && <Dot color={accent} />}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.txt1 }}>{icon} {title}</div>
            <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {phase === "done" && <span style={{ fontSize: 9, color: accent, fontFamily: T.mono, fontWeight: 700 }}>{msg}</span>}
          {phase === "error" && <span style={{ fontSize: 9, color: T.red }}>{msg.slice(0, 40)}</span>}
          <button onClick={onScan} disabled={isLoading} style={{
            padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
            cursor: isLoading ? "not-allowed" : "pointer",
            background: isLoading ? "rgba(255,255,255,0.03)" : `${accent}15`,
            border: `1px solid ${isLoading ? T.border : accent + "40"}`,
            color: isLoading ? T.txt3 : accent, whiteSpace: "nowrap",
          }}>{btnLabel}</button>
        </div>
      </>
    }>
      <div style={{ padding: trends.length > 0 ? "10px" : "0" }}>
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.3 }}>{icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.txt3 }}>{title}</div>
            <div style={{ fontSize: 10, color: T.txt3, marginTop: 3 }}>{subtitle}</div>
          </div>
        )}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
            <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>{phase === "fetching" ? "📡" : "🧠"}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: accent }}>{phase === "fetching" ? "Obteniendo datos en tiempo real..." : "Analizando con Claude AI..."}</div>
          </div>
        )}
        {phase === "done" && trends.map((t) => (
          <TrendCard key={t.id} t={t} open={expanded === t.id} toggle={() => onToggle(t.id)} votes={votes} onVote={onVote} onCreate={onCreate} />
        ))}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ fontSize: 11, color: T.red, marginBottom: 6 }}>⚠ {msg}</div>
            <button onClick={onScan} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${T.red}30`, background: `${T.red}0d`, color: T.red, fontSize: 11, cursor: "pointer" }}>Reintentar</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════ BRAND PULSE PANEL ═══════════════════ */

const BRAND_PULSE_ACCENT = "#a78bfa";

/** Mini gráfico SVG de serie de tiempo para las 3 marcas */
function TrendlineChart({ points, brands }: {
  points: { date: string; values: number[] }[];
  brands: { color: string }[];
}) {
  if (points.length < 2) return null;
  const W = 100;
  const H = 50;
  const PAD = 3;
  const usable = W - PAD * 2;
  const usableH = H - PAD * 2;
  const getPath = (idx: number) =>
    points.map((p, i) => {
      const x = PAD + (i / (points.length - 1)) * usable;
      const y = PAD + usableH - ((p.values[idx] ?? 0) / 100) * usableH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 60, display: "block" }} preserveAspectRatio="none">
      {/* grid lines at 25/50/75 */}
      {[25, 50, 75].map(v => {
        const y = (PAD + usableH - (v / 100) * usableH).toFixed(1);
        return <line key={v} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />;
      })}
      {brands.map((b, i) => (
        <path key={i} d={getPath(i)} fill="none" stroke={b.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function BrandPulsePanel({ phase, data, onScan }: {
  phase: "idle" | "fetching" | "done" | "error";
  data: BrandPulseResult | null;
  onScan: () => void;
}) {
  const isLoading = phase === "fetching";
  const btnLabel = phase === "idle" ? "Escanear" : isLoading ? "📡 Consultando..." : phase === "error" ? "🔄 Reintentar" : "🔄 Actualizar";
  const TREND_ICON: Record<string, string> = { up: "▲", down: "▼", stable: "●" };
  const TREND_COLOR: Record<string, string> = { up: T.green, down: T.red, stable: T.txt3 };

  return (
    <Panel accent={BRAND_PULSE_ACCENT} header={
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {phase === "done" && <Dot color={BRAND_PULSE_ACCENT} />}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.txt1 }}>📊 Pulso de Marca</div>
            <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>
              {data?.source ?? "trends.google.com"} · Interés relativo búsqueda · 30 días · Chile
            </div>
          </div>
        </div>
        <button onClick={onScan} disabled={isLoading} style={{
          padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
          cursor: isLoading ? "not-allowed" : "pointer",
          background: isLoading ? "rgba(255,255,255,0.03)" : `${BRAND_PULSE_ACCENT}15`,
          border: `1px solid ${isLoading ? T.border : BRAND_PULSE_ACCENT + "40"}`,
          color: isLoading ? T.txt3 : BRAND_PULSE_ACCENT, whiteSpace: "nowrap",
        }}>{btnLabel}</button>
      </>
    }>
      <div style={{ padding: "10px 12px" }}>
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.3 }}>📊</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.txt3 }}>Pulso de Marca</div>
            <div style={{ fontSize: 10, color: T.txt3, marginTop: 3 }}>Blue Express vs Chilexpress vs Starken · Google Trends Chile</div>
          </div>
        )}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>📊</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_PULSE_ACCENT }}>Consultando Google Trends...</div>
            <div style={{ fontSize: 9, color: T.txt3, marginTop: 4 }}>Puede tardar ~15s · Playwright navega Google Trends</div>
          </div>
        )}
        {phase === "done" && data && (
          <>
            {/* Leyenda de escala */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Label>Interés relativo 0–100 (100 = pico del período)</Label>
              {data.timelinePoints.length > 0 && (
                <span style={{ fontSize: 8, color: T.txt3, fontFamily: T.mono }}>
                  {data.timelinePoints[0]?.date} → {data.timelinePoints[data.timelinePoints.length - 1]?.date}
                </span>
              )}
            </div>

            {/* Gráfico de evolución 30 días */}
            {data.timelinePoints.length >= 2 && (
              <div style={{ marginBottom: 10, background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "6px 6px 2px", border: `1px solid ${T.border}` }}>
                <TrendlineChart points={data.timelinePoints} brands={data.brands} />
                {/* Leyenda del gráfico */}
                <div style={{ display: "flex", gap: 10, justifyContent: "center", paddingBottom: 4 }}>
                  {data.brands.map(b => (
                    <span key={b.name} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: b.color, fontFamily: T.mono }}>
                      <span style={{ display: "inline-block", width: 16, height: 2, background: b.color, borderRadius: 1 }} />
                      {b.name === "Blue Express" ? "Blue Express" : b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Barras de score promedio */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {data.brands.map((brand) => (
                <div key={brand.name}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: brand.color, width: 94, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{brand.name}</span>
                    <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${brand.score}%`, background: brand.color, borderRadius: 3, transition: "width 0.8s ease" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: brand.color, fontFamily: T.mono, width: 24, textAlign: "right", flexShrink: 0 }}>{brand.score}</span>
                    <span style={{ fontSize: 9, color: TREND_COLOR[brand.trend] ?? T.txt3, fontWeight: 700, width: 12, flexShrink: 0 }}>
                      {TREND_ICON[brand.trend] ?? "●"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Consultas relacionadas en ascenso para Blue Express */}
            {data.relatedQueries.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 5 }}>
                  <Label>🔍 Consultas relacionadas Blue Express · En ascenso</Label>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {data.relatedQueries.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontSize: 9, color: T.txt2, flex: 1 }}>{i + 1}. {q.query}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: T.green, fontFamily: T.mono, flexShrink: 0 }}>{q.growth}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insight */}
            {data.insight && (
              <div style={{ background: `${BRAND_PULSE_ACCENT}08`, border: `1px solid ${BRAND_PULSE_ACCENT}18`, borderRadius: 7, padding: "8px 10px" }}>
                <span style={{ fontSize: 9, color: BRAND_PULSE_ACCENT, fontWeight: 700 }}>💡 </span>
                <span style={{ fontSize: 10, color: T.txt2, lineHeight: 1.4 }}>{data.insight}</span>
              </div>
            )}
          </>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ fontSize: 10, color: T.red, marginBottom: 6 }}>⚠ Error al obtener datos de marca</div>
            <button onClick={onScan} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${T.red}30`, background: `${T.red}0d`, color: T.red, fontSize: 11, cursor: "pointer" }}>Reintentar</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════ APP REVIEWS PANEL ═══════════════════ */

const REVIEWS_ACCENT = "#fbbf24";
const SENTIMENT_COLOR: Record<string, string> = { positivo: "#00d68f", mixto: "#f59e0b", negativo: "#f87171" };
const SENTIMENT_LABEL: Record<string, string> = { positivo: "✓ positivo", mixto: "~ mixto", negativo: "✗ negativo" };

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span style={{ fontSize: 11, letterSpacing: -1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= full ? REVIEWS_ACCENT : "rgba(255,255,255,0.15)" }}>★</span>
      ))}
    </span>
  );
}

function AppReviewsPanel({ phase, data, onScan, onOpportunity }: {
  phase: "idle" | "fetching" | "done" | "error";
  data: AppReviewsResult | null;
  onScan: () => void;
  onOpportunity: () => void;
}) {
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const isLoading = phase === "fetching";
  const btnLabel = phase === "idle" ? "Escanear" : isLoading ? "🔍 Buscando..." : phase === "error" ? "🔄 Reintentar" : "🔄 Actualizar";

  return (
    <Panel accent={REVIEWS_ACCENT} header={
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {phase === "done" && <Dot color={REVIEWS_ACCENT} />}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.txt1 }}>⭐ Reviews Competencia</div>
            <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>Google Play Store · Reviews recientes</div>
          </div>
        </div>
        <button onClick={onScan} disabled={isLoading} style={{
          padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
          cursor: isLoading ? "not-allowed" : "pointer",
          background: isLoading ? "rgba(255,255,255,0.03)" : `${REVIEWS_ACCENT}15`,
          border: `1px solid ${isLoading ? T.border : REVIEWS_ACCENT + "40"}`,
          color: isLoading ? T.txt3 : REVIEWS_ACCENT, whiteSpace: "nowrap",
        }}>{btnLabel}</button>
      </>
    }>
      <div style={{ padding: 12 }}>
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.3 }}>⭐</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.txt3 }}>Reviews Competencia</div>
            <div style={{ fontSize: 10, color: T.txt3, marginTop: 3 }}>Chilexpress · Starken · Google Play</div>
          </div>
        )}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>⭐</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: REVIEWS_ACCENT }}>Analizando reviews con Claude...</div>
          </div>
        )}
        {phase === "done" && data && (
          <>
            {/* Apps */}
            {data.apps.map((app) => {
              const compColor = app.name === "Chilexpress" ? "#FF6B00" : "#E31837";
              const isOpen = expandedApp === app.name;
              return (
                <div key={app.name} style={{ background: T.card, border: `1px solid ${compColor}25`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
                  <div onClick={() => setExpandedApp(isOpen ? null : app.name)} style={{ padding: "10px 12px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>{app.name === "Chilexpress" ? "🟠" : "🔴"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: compColor }}>{app.name}</span>
                          <StarRating rating={app.rating} />
                          <span style={{ fontSize: 10, fontWeight: 800, color: T.txt1, fontFamily: T.mono }}>{app.rating.toFixed(1)}</span>
                          <span style={{ fontSize: 8, color: T.txt3, fontFamily: T.mono }}>{app.totalReviews}</span>
                          <span style={{
                            fontSize: 8, fontWeight: 700, color: SENTIMENT_COLOR[app.recentSentiment],
                            background: `${SENTIMENT_COLOR[app.recentSentiment]}15`, padding: "1px 7px",
                            borderRadius: 4, border: `1px solid ${SENTIMENT_COLOR[app.recentSentiment]}25`,
                          }}>{SENTIMENT_LABEL[app.recentSentiment]}</span>
                        </div>
                        {/* Issues */}
                        {app.topIssues.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {app.topIssues.map((issue, i) => (
                              <span key={i} style={{ fontSize: 8, color: T.red, background: `${T.red}10`, padding: "1px 6px", borderRadius: 3, border: `1px solid ${T.red}20` }}>⚠ {issue}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span style={{ color: T.txt3, fontSize: 10, flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "0.2s" }}>▾</span>
                    </div>
                  </div>
                  {isOpen && app.recentReviews.length > 0 && (
                    <div style={{ borderTop: `1px solid ${compColor}15`, padding: "8px 12px" }}>
                      <div style={{ marginBottom: 6 }}><Label>Últimas reviews</Label></div>
                      {app.recentReviews.map((rev, i) => (
                        <div key={i} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "7px 9px", marginBottom: 5, border: `1px solid ${T.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <StarRating rating={rev.rating} />
                            <span style={{ fontSize: 8, color: T.txt3, fontFamily: T.mono }}>{rev.date}</span>
                            <span style={{ fontSize: 8, color: SENTIMENT_COLOR[rev.sentiment], fontWeight: 700 }}>● {rev.sentiment}</span>
                          </div>
                          <p style={{ fontSize: 10, color: T.txt2, margin: 0, lineHeight: 1.4 }}>&ldquo;{rev.text}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Insight */}
            {data.insight && (
              <div style={{ background: `${REVIEWS_ACCENT}08`, border: `1px solid ${REVIEWS_ACCENT}18`, borderRadius: 7, padding: "8px 10px", marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: REVIEWS_ACCENT, fontWeight: 700 }}>💡 </span>
                <span style={{ fontSize: 10, color: T.txt2, lineHeight: 1.4 }}>{data.insight}</span>
              </div>
            )}

            {/* Oportunidad */}
            {data.opportunity && (
              <div style={{ background: `${T.blue}08`, border: `1px solid ${T.blue}25`, borderLeft: `3px solid ${T.blue}`, borderRadius: 7, padding: "9px 11px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: T.blue, fontWeight: 700, marginBottom: 3 }}>🎯 OPORTUNIDAD</div>
                  <p style={{ fontSize: 10, color: T.txt2, margin: 0, lineHeight: 1.4 }}>{data.opportunity}</p>
                </div>
                <button onClick={onOpportunity} style={{
                  padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.blue}40`,
                  background: `${T.blue}15`, color: T.blue, fontSize: 9, fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}>→ Crear campaña</button>
              </div>
            )}
          </>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ fontSize: 10, color: T.red, marginBottom: 6 }}>⚠ Error al obtener reviews</div>
            <button onClick={onScan} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${T.red}30`, background: `${T.red}0d`, color: T.red, fontSize: 11, cursor: "pointer" }}>Reintentar</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════ MAIN DASHBOARD ═══════════════════ */

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"tendencias" | "competencia">("tendencias");

  const [twitterTrends, setTwitterTrends] = useState<ScoredTrend[]>([]);
  const [twitterPhase, setTwitterPhase] = useState<"idle" | "fetching" | "scoring" | "done" | "error">("idle");
  const [twitterMsg, setTwitterMsg] = useState("");
  const [twitterExpanded, setTwitterExpanded] = useState<number | null>(null);
  const [twitterVotes, setTwitterVotes] = useState<Set<string>>(new Set());

  const [googleTrends, setGoogleTrends] = useState<ScoredTrend[]>([]);
  const [googlePhase, setGooglePhase] = useState<"idle" | "fetching" | "scoring" | "done" | "error">("idle");
  const [googleMsg, setGoogleMsg] = useState("");
  const [googleExpanded, setGoogleExpanded] = useState<number | null>(null);
  const [googleVotes, setGoogleVotes] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<{ campaign: Campaign; trend: ScoredTrend } | null>(null);

  const [compData, setCompData] = useState<CompetitorAnalysis | null>(null);
  const [compPhase, setCompPhase] = useState<"idle" | "fetching" | "analyzing" | "done" | "error">("idle");
  const [compMsg, setCompMsg] = useState("");
  const [compExpanded, setCompExpanded] = useState<string | null>(null);
  const [compScreenshot, setCompScreenshot] = useState<string | null>(null);

  const [metaAds, setMetaAds] = useState<MetaAdsCompetitorResult[]>([]);
  const [metaPhase, setMetaPhase] = useState<"idle" | "fetching" | "done" | "error">("idle");
  const [metaMsg, setMetaMsg] = useState("");
  const [metaScreenshot, setMetaScreenshot] = useState<string | null>(null);

  const [brandPulse, setBrandPulse] = useState<BrandPulseResult | null>(null);
  const [brandPhase, setBrandPhase] = useState<"idle" | "fetching" | "done" | "error">("idle");

  const [appReviews, setAppReviews] = useState<AppReviewsResult | null>(null);
  const [reviewsPhase, setReviewsPhase] = useState<"idle" | "fetching" | "done" | "error">("idle");

  const scanTrends = async () => {
    setTwitterPhase("fetching"); setTwitterMsg(""); setTwitterTrends([]);
    setGooglePhase("fetching"); setGoogleMsg(""); setGoogleTrends([]);
    try {
      setTwitterPhase("scoring"); setGooglePhase("scoring");
      const { twitter, google } = await apiScan();
      if (twitter.length) {
        setTwitterTrends(sortByScore(twitter));
        setTwitterPhase("done"); setTwitterMsg(`${twitter.length} tendencias`);
      } else {
        setTwitterPhase("error"); setTwitterMsg("Sin tendencias de X encontradas");
      }
      if (google.length) {
        setGoogleTrends(sortByScore(google));
        setGooglePhase("done"); setGoogleMsg(`${google.length} búsquedas`);
      } else {
        setGooglePhase("error"); setGoogleMsg("Sin datos de Google Trends");
      }
    } catch (e: any) {
      const msg = e.message || "Error";
      setTwitterPhase("error"); setTwitterMsg(msg);
      setGooglePhase("error"); setGoogleMsg(msg);
    }
  };

  const scanBrandPulse = async () => {
    setBrandPhase("fetching"); setBrandPulse(null);
    try {
      const data = await apiBrandPulse();
      setBrandPulse(data); setBrandPhase("done");
    } catch (e: any) { setBrandPhase("error"); }
  };

  const scanAppReviews = async () => {
    setReviewsPhase("fetching"); setAppReviews(null);
    try {
      const data = await apiAppReviews();
      setAppReviews(data); setReviewsPhase("done");
    } catch (e: any) { setReviewsPhase("error"); }
  };

  const scanAll = () => {
    scanTrends();
    scanBrandPulse();
    scanAppReviews();
  };

  const scanMetaAds = async () => {
    setMetaPhase("fetching"); setMetaMsg("Abriendo Meta Ads Library..."); setMetaAds([]); setMetaScreenshot(null);
    try {
      const results = await apiMetaAds();
      setMetaAds(results); setMetaPhase("done");
      const total = results.reduce((a, r) => a + r.ads.length, 0);
      setMetaMsg(`${total} anuncios detectados`);
    } catch (e: any) { setMetaPhase("error"); setMetaMsg(e.message || "Error"); }
  };

  const scanCompetitors = async () => {
    setCompPhase("fetching"); setCompMsg("Escaneando Facebook + IA..."); setCompData(null);
    try {
      const analysis = await apiCompetitors();
      setCompData(analysis); setCompPhase("done");
      const postCount = (analysis.competitors || []).reduce((a: number, c: any) => a + (c.posts || []).length, 0);
      setCompMsg(`${postCount} publicaciones detectadas`);
    } catch (e: any) { setCompPhase("error"); setCompMsg(e.message || "Error"); }
  };

  const oppToNotion = (opp: CompetitiveOpportunity): { campaign: Campaign; trend: ScoredTrend } => ({
    campaign: { id: `opp-${opp.title}`, title: opp.title, channel: opp.channel, copy: opp.suggestion, cta: "Ver más", estimatedReach: "—", votes: 0 },
    trend: { id: 0, title: `Competencia: ${opp.trigger}`, source: "Competencia", sourceIcon: "🏁", category: "Competencia", summary: opp.suggestion, relevanceScore: 0, viralScore: 0, brandFitScore: 0, timingWindow: "—", effort: "M", volume: 0, velocity: "—", timestamp: "Ahora", campaigns: [] },
  });

  const voteTwitter = (id: string) => setTwitterVotes(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const voteGoogle = (id: string) => setGoogleVotes(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sortByScore = (arr: ScoredTrend[]) => [...arr].sort((a, b) => {
    const sc = (t: ScoredTrend) => ((t.relevanceScore || 0) + (t.viralScore || 0) + (t.brandFitScore || 0)) / 3;
    return sc(b) - sc(a);
  });

  const anyLive = twitterPhase === "done" || googlePhase === "done";
  const today = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.txt1, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      {/* ── STATUS BAR ── */}
      <div style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: "0 20px", display: "flex", alignItems: "center", gap: 16,
        height: 36, fontSize: 10, color: T.txt3, fontFamily: T.mono,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 8, fontWeight: 700, color: T.green,
            background: `${T.green}12`, padding: "2px 8px", borderRadius: 3,
            border: `1px solid ${T.green}25`,
            animation: anyLive ? "blink 2s ease-in-out infinite" : "none",
          }}>
            ● {anyLive ? "LIVE" : "STANDBY"}
          </span>
        </div>
        <span style={{ color: T.txt3 }}>|</span>
        <span>{today}</span>
        <span style={{ color: T.txt3 }}>|</span>
        <span>Blue Express × Copec Digital</span>
        <span style={{ color: T.txt3 }}>|</span>
        <span>Líder: R. Madariaga</span>
        <div style={{ flex: 1 }} />
        {anyLive && (
          <span style={{ fontSize: 9, color: T.green }}>
            {[twitterPhase === "done" && "𝕏", googlePhase === "done" && "Google"].filter(Boolean).join(" · ")} activos
          </span>
        )}
      </div>

      {/* ── HEADER ── */}
      <div style={{
        padding: "20px 24px 0",
        background: `linear-gradient(180deg, ${T.blue}06 0%, transparent 100%)`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: `linear-gradient(135deg, #0033aa, ${T.blue})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
              boxShadow: `0 0 20px ${T.blue}40`,
            }}>⚡</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
                <span style={{ color: T.txt1 }}>TREND SCOUT</span>
                <span style={{ color: T.blue }}> AGENT</span>
              </h1>
              <p style={{ fontSize: 10, color: T.txt3, margin: "1px 0 0", fontFamily: T.mono }}>
                Scraping real · Scoring IA · Push a Notion
              </p>
            </div>
          </div>

          {/* Brand pills */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end" }}>
            {BRAND.pillars.map((p, i) => (
              <span key={i} style={{ fontSize: 8, fontWeight: 700, color: T.blue, background: `${T.blue}10`, padding: "2px 7px", borderRadius: 3, border: `1px solid ${T.blue}20`, fontFamily: T.mono }}>{p}</span>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 2, marginBottom: -1 }}>
          {([
            { k: "tendencias", l: "📡 TENDENCIAS", accent: T.blue },
            { k: "competencia", l: "🏁 COMPETENCIA", accent: T.red },
          ] as const).map(tab => (
            <button key={tab.k} onClick={() => setActiveTab(tab.k)} style={{
              padding: "8px 18px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: T.mono, letterSpacing: 0.5,
              background: activeTab === tab.k ? T.surface : "transparent",
              border: `1px solid ${activeTab === tab.k ? tab.accent + "50" : "transparent"}`,
              borderBottom: activeTab === tab.k ? `1px solid ${T.surface}` : `1px solid transparent`,
              color: activeTab === tab.k ? tab.accent : T.txt3,
              borderRadius: "8px 8px 0 0",
              marginBottom: activeTab === tab.k ? -1 : 0,
            }}>{tab.l}</button>
          ))}
        </div>
      </div>

      {/* ── TENDENCIAS TAB ── */}
      {activeTab === "tendencias" && (
        <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Fila 1: Trends en tiempo real */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14,
            alignItems: "start",
          }}>
            <TrendPanel
              title="Twitter / X" icon="𝕏" accent={T.twitter}
              subtitle="trends24.in/chile · Tiempo real"
              phase={twitterPhase} msg={twitterMsg}
              trends={twitterTrends} expanded={twitterExpanded} votes={twitterVotes}
              onScan={scanTrends}
              onToggle={(id) => setTwitterExpanded(twitterExpanded === id ? null : id)}
              onVote={voteTwitter}
              onCreate={(c, tr) => setModal({ campaign: c, trend: tr })}
            />
            <TrendPanel
              title="Google Trends" icon="🔍" accent={T.google}
              subtitle="trends.google.es · Últimas 24 horas"
              phase={googlePhase} msg={googleMsg}
              trends={googleTrends} expanded={googleExpanded} votes={googleVotes}
              onScan={scanTrends}
              onToggle={(id) => setGoogleExpanded(googleExpanded === id ? null : id)}
              onVote={voteGoogle}
              onCreate={(c, tr) => setModal({ campaign: c, trend: tr })}
            />
          </div>

          {/* Separador de nivel */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono, fontWeight: 700, letterSpacing: 1.5, whiteSpace: "nowrap" }}>
              INTELIGENCIA DE MARCA
            </span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          {/* Fila 2: Brand Intelligence */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14,
            alignItems: "start",
          }}>
            <BrandPulsePanel
              phase={brandPhase}
              data={brandPulse}
              onScan={scanBrandPulse}
            />
            <AppReviewsPanel
              phase={reviewsPhase}
              data={appReviews}
              onScan={scanAppReviews}
              onOpportunity={() => setActiveTab("tendencias")}
            />
          </div>

        </div>
      )}

      {/* ── COMPETENCIA TAB ── */}
      {activeTab === "competencia" && (
        <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* META ADS LIBRARY */}
          <Panel accent={T.meta} header={
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {metaPhase === "done" && <Dot color={T.meta} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.txt1 }}>📲 META ADS LIBRARY</div>
                  <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>Anuncios activos por página · Playwright</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {metaPhase === "done" && <span style={{ fontSize: 9, color: T.meta, fontFamily: T.mono, fontWeight: 700 }}>{metaMsg}</span>}
                {metaPhase === "error" && <span style={{ fontSize: 9, color: T.red }}>{metaMsg.slice(0, 40)}</span>}
                <button onClick={scanMetaAds} disabled={metaPhase === "fetching"} style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
                  cursor: metaPhase === "fetching" ? "not-allowed" : "pointer",
                  background: metaPhase === "fetching" ? "rgba(255,255,255,0.03)" : `${T.meta}15`,
                  border: `1px solid ${metaPhase === "fetching" ? T.border : T.meta + "40"}`,
                  color: metaPhase === "fetching" ? T.txt3 : T.meta, whiteSpace: "nowrap",
                }}>
                  {metaPhase === "idle" ? "Escanear" : metaPhase === "fetching" ? "🌐 Abriendo..." : metaPhase === "error" ? "🔄 Reintentar" : "🔄 Actualizar"}
                </button>
              </div>
            </>
          }>
            <div style={{ padding: 12 }}>
              {metaPhase === "idle" && (
                <div style={{ textAlign: "center", padding: "28px 20px" }}>
                  <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.25 }}>📲</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.txt3, marginBottom: 3 }}>Chilexpress · Starken · Meta Ads</div>
                  <div style={{ fontSize: 9, color: T.txt3 }}>Playwright navega la Biblioteca de Anuncios por página oficial</div>
                </div>
              )}
              {metaPhase === "fetching" && (
                <div style={{ textAlign: "center", padding: "28px 20px" }}>
                  <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
                  <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>🌐</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.meta }}>{metaMsg}</div>
                  <div style={{ fontSize: 9, color: T.txt3, marginTop: 4 }}>Puede tardar ~60s — navegando Meta Ads Library</div>
                </div>
              )}
              {metaPhase === "done" && metaAds.length > 0 && (
                <>
                  {metaScreenshot && (
                    <div onClick={() => setMetaScreenshot(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                      <div style={{ position: "relative" }}>
                        <img src={`data:image/jpeg;base64,${metaScreenshot}`} alt="Meta Ads" style={{ maxWidth: "92vw", maxHeight: "86vh", borderRadius: 10, border: `1px solid ${T.border}` }} />
                        <button onClick={() => setMetaScreenshot(null)} style={{ position: "absolute", top: -12, right: -12, width: 28, height: 28, borderRadius: "50%", background: T.surface, border: `1px solid ${T.border}`, color: T.txt2, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                    {metaAds.map((result) => {
                      const color = result.competitor === "Chilexpress" ? "#FF6B00" : "#E31837";
                      return (
                        <div key={result.competitor} style={{ background: T.card, border: `1px solid ${color}20`, borderTop: `2px solid ${color}`, borderRadius: 9, overflow: "hidden" }}>
                          <div style={{ padding: "8px 11px", borderBottom: `1px solid ${color}15`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: T.mono }}>{result.competitor.toUpperCase()}</span>
                            <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>{result.ads.length} anuncios</span>
                          </div>
                          {result.screenshotB64 && (
                            <div onClick={() => setMetaScreenshot(result.screenshotB64)} style={{ position: "relative", cursor: "zoom-in", overflow: "hidden", borderBottom: `1px solid ${color}10` }}>
                              <img src={`data:image/jpeg;base64,${result.screenshotB64}`} alt={`${result.competitor} Meta Ads`}
                                style={{ width: "100%", display: "block", maxHeight: 140, objectFit: "cover", objectPosition: "top" }} />
                              <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 8, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 6px", borderRadius: 3 }}>🔍 Ver completo</div>
                            </div>
                          )}
                          {result.error && (
                            <div style={{ padding: "7px 11px" }}>
                              <span style={{ fontSize: 9, color: T.red }}>⚠ {result.error.slice(0, 80)}</span>
                            </div>
                          )}
                          <div style={{ padding: "7px 9px" }}>
                            {result.ads.length === 0 && !result.error && (
                              <div style={{ fontSize: 10, color: T.txt3, padding: "8px 0", textAlign: "center" }}>Sin anuncios detectados</div>
                            )}
                            {result.ads.map((ad: MetaAd) => (
                              <div key={ad.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 9px", marginBottom: 6 }}>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                                  <Badge color={color}>{ad.platform || "Meta"}</Badge>
                                  {ad.creativeType && <Badge color={T.txt3}>{ad.creativeType}</Badge>}
                                  {ad.activeFrom && <span style={{ fontSize: 8, color: T.txt3, fontFamily: T.mono }}>desde {ad.activeFrom}</span>}
                                </div>
                                <p style={{ fontSize: 10, color: T.txt2, margin: "0 0 4px", lineHeight: 1.4 }}>{ad.copy}</p>
                                {ad.cta && <Badge color={T.meta}>{ad.cta}</Badge>}
                              </div>
                            ))}
                          </div>
                          <div style={{ padding: "3px 11px 8px", fontSize: 8, color: T.txt3, fontFamily: T.mono }}>
                            {new Date(result.scannedAt).toLocaleTimeString("es-CL")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </Panel>

          {/* ANÁLISIS REDES */}
          <Panel accent={T.red} header={
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {compPhase === "done" && <Dot color={T.red} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.txt1 }}>📱 ANÁLISIS REDES</div>
                  <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>Facebook · Screenshots + Claude web_search</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {compPhase === "done" && <span style={{ fontSize: 9, color: T.red, fontFamily: T.mono, fontWeight: 700 }}>{compMsg}</span>}
                {compPhase === "error" && <span style={{ fontSize: 9, color: T.red }}>{compMsg.slice(0, 40)}</span>}
                <button onClick={scanCompetitors} disabled={compPhase === "fetching"} style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
                  cursor: compPhase === "fetching" ? "not-allowed" : "pointer",
                  background: compPhase === "fetching" ? "rgba(255,255,255,0.03)" : `${T.red}12`,
                  border: `1px solid ${compPhase === "fetching" ? T.border : T.red + "40"}`,
                  color: compPhase === "fetching" ? T.txt3 : T.red, whiteSpace: "nowrap",
                }}>
                  {compPhase === "idle" ? "Escanear" : compPhase === "fetching" ? "🧠 Analizando..." : compPhase === "error" ? "🔄 Reintentar" : "🔄 Actualizar"}
                </button>
              </div>
            </>
          }>
            <div style={{ padding: 12 }}>
              {compPhase === "idle" && (
                <div style={{ textAlign: "center", padding: "28px 20px" }}>
                  <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.25 }}>📱</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.txt3, marginBottom: 3 }}>Análisis Redes Sociales</div>
                  <div style={{ fontSize: 9, color: T.txt3 }}>Screenshots de Facebook + análisis IA de {COMPETITORS.map(c => c.name).join(", ")}</div>
                </div>
              )}
              {compPhase === "fetching" && (
                <div style={{ textAlign: "center", padding: "28px 20px" }}>
                  <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>🧠</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.red }}>Escaneando Facebook + web_search...</div>
                  <div style={{ fontSize: 9, color: T.txt3, marginTop: 4 }}>Tomando screenshots de Facebook y analizando con Claude</div>
                </div>
              )}
              {compPhase === "done" && compData && (
                <>
                  {compData.summary && (
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "11px 13px", marginBottom: 12 }}>
                      <Label>Panorama Competitivo</Label>
                      <p style={{ fontSize: 11, color: T.txt2, margin: "6px 0 0", lineHeight: 1.55 }}>{compData.summary}</p>
                    </div>
                  )}

                  {/* Screenshots grid */}
                  {(compData.screenshots || []).length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ marginBottom: 8 }}><Label>Facebook · Perfiles</Label></div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        {(compData.screenshots || [])
                          .filter(s => s.screenshotB64)
                          .map((s, i) => {
                            const color = COMPETITOR_COLORS[s.competitor] || "#888";
                            return (
                              <div key={i} style={{ background: T.card, border: `1px solid ${color}20`, borderTop: `2px solid ${color}`, borderRadius: 8, overflow: "hidden" }}>
                                <div style={{ padding: "7px 10px", borderBottom: `1px solid ${color}15`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: T.mono }}>{s.competitor.toUpperCase()}</span>
                                  <span style={{ fontSize: 8, color: T.txt3 }}>📘 Facebook</span>
                                </div>
                                <div onClick={() => setCompScreenshot(s.screenshotB64)} style={{ position: "relative", cursor: "zoom-in", overflow: "hidden" }}>
                                  <img src={`data:image/jpeg;base64,${s.screenshotB64}`} alt={`${s.competitor} Facebook`}
                                    style={{ width: "100%", display: "block", maxHeight: 160, objectFit: "cover", objectPosition: "top" }} />
                                  <div style={{ position: "absolute", bottom: 4, right: 6, fontSize: 8, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "1px 6px", borderRadius: 3 }}>🔍 Ver</div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {compData.opportunities?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ marginBottom: 8 }}><Label>Oportunidades Reactivas ({compData.opportunities.length})</Label></div>
                      {compData.opportunities.map((opp, i) => (
                        <OpportunityCard key={i} opp={opp} onNotion={() => setModal(oppToNotion(opp))} />
                      ))}
                    </div>
                  )}

                  <div style={{ marginBottom: 8 }}><Label>Actividad por Competidor</Label></div>
                  {compData.competitors?.map((comp) => (
                    <CompetitorCard
                      key={comp.name} comp={comp}
                      open={compExpanded === comp.name}
                      toggle={() => setCompExpanded(compExpanded === comp.name ? null : comp.name)}
                      screenshots={(compData.screenshots || [])
                        .filter(s => s.competitor === comp.name)
                        .map(({ platform, screenshotB64 }) => ({ platform, screenshotB64 }))}
                      onScreenshot={setCompScreenshot}
                    />
                  ))}
                </>
              )}
              {compPhase === "error" && (
                <div style={{ textAlign: "center", padding: "24px 20px" }}>
                  <div style={{ fontSize: 11, color: T.red, marginBottom: 6 }}>⚠ {compMsg}</div>
                  <button onClick={scanCompetitors} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${T.red}30`, background: `${T.red}0d`, color: T.red, fontSize: 11, cursor: "pointer" }}>Reintentar</button>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Screenshot lightbox (competitor) */}
      {compScreenshot && (
        <div onClick={() => setCompScreenshot(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "relative" }}>
            <img src={`data:image/jpeg;base64,${compScreenshot}`} alt="RRSS screenshot" style={{ maxWidth: "92vw", maxHeight: "86vh", borderRadius: 10, border: `1px solid ${T.border}` }} />
            <button onClick={() => setCompScreenshot(null)} style={{ position: "absolute", top: -12, right: -12, width: 28, height: 28, borderRadius: "50%", background: T.surface, border: `1px solid ${T.border}`, color: T.txt2, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>TREND SCOUT v2.0 · Blue Express × Copec</span>
        <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.mono }}>claude-sonnet-4-6</span>
      </div>

      {modal && <NotionModal campaign={modal.campaign} trend={modal.trend} onClose={() => setModal(null)} />}
    </div>
  );
}
