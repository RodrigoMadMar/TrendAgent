"use client";

import { useState } from "react";
import { BRAND, COMPETITORS, TEAM, getTasksForChannel, offsetDate } from "@/lib/constants";
import type { ScoredTrend, Campaign, CompetitorAnalysis, CompetitorPost, CompetitiveOpportunity } from "@/lib/constants";

/* ═══════════════════ API CALLS (to our proxy routes) ═══════════════════ */

async function apiScanTwitter(): Promise<any[]> {
  const res = await fetch("/api/scan-twitter", { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.trends || [];
}

async function apiScanGoogle(): Promise<any[]> {
  const res = await fetch("/api/scan-google", { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.trends || [];
}

async function apiScore(trends: any[]): Promise<ScoredTrend[]> {
  const res = await fetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trends }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.trends || [];
}

async function apiNotion(payload: any): Promise<any> {
  const res = await fetch("/api/notion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function apiCompetitors(): Promise<CompetitorAnalysis> {
  const res = await fetch("/api/competitors", { method: "POST" });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Error al escanear competidores. Reintenta en unos segundos."); }
  if (data.error) throw new Error(data.error);
  return data;
}

/* ═══════════════════ SMALL UI COMPONENTS ═══════════════════ */

const Score = ({ score, label }: { score: number; label: string }) => {
  const s = typeof score === "number" && !isNaN(score) ? score : 0;
  const bg = s >= 8.5 ? "#0a2e1a" : s >= 6.5 ? "#1a1a0a" : "#2e0a0a";
  const tx = s >= 8.5 ? "#34d399" : s >= 6.5 ? "#fbbf24" : "#f87171";
  const bd = s >= 8.5 ? "#166534" : s >= 6.5 ? "#854d0e" : "#991b1b";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, background: bg, border: `1px solid ${bd}`, borderRadius: 6, padding: "4px 0", flex: 1 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: tx, fontFamily: "'JetBrains Mono', monospace" }}>{s}</span>
      <span style={{ fontSize: 7, color: "#888", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{label}</span>
    </div>
  );
};

const EffortTag = ({ effort }: { effort: string }) => {
  const c = { S: { l: "Quick Win", c: "#34d399" }, M: { l: "Medio", c: "#fbbf24" }, L: { l: "Campaña", c: "#f97316" } }[effort] || { l: effort, c: "#888" };
  return <span style={{ fontSize: 9, fontWeight: 600, color: c.c, background: `${c.c}18`, padding: "2px 7px", borderRadius: 12, border: `1px solid ${c.c}33`, whiteSpace: "nowrap" }}>{c.l}</span>;
};

const COMPETITOR_COLORS: Record<string, string> = {
  "Chilexpress": "#FF6B00",
  "Starken": "#E31837",
  "Correos de Chile": "#003DA5",
};

const PLATFORM_ICONS: Record<string, string> = {
  "Instagram": "📷",
  "X": "𝕏",
  "TikTok": "🎵",
};

const URGENCY_COLORS: Record<string, string> = {
  "alta": "#f87171",
  "media": "#fbbf24",
  "baja": "#34d399",
};

const CHANNEL_STYLES: Record<string, { color: string; icon: string }> = {
  "Email":                { color: "#a78bfa", icon: "✉️" },
  "Push":                 { color: "#38bdf8", icon: "🔔" },
  "Push + Email":         { color: "#818cf8", icon: "🔔✉️" },
  "Instagram Post":       { color: "#f472b6", icon: "📷" },
  "Instagram Story":      { color: "#fb923c", icon: "📸" },
  "Instagram + TikTok":   { color: "#e879f9", icon: "📲" },
  "TikTok":               { color: "#2dd4bf", icon: "🎵" },
  "Paid Social":          { color: "#facc15", icon: "💰" },
  "SMS":                  { color: "#4ade80", icon: "💬" },
  "Full funnel":          { color: "#f87171", icon: "🎯" },
};

const ChannelTag = ({ channel }: { channel: string }) => {
  const s = CHANNEL_STYLES[channel] || { color: "#888", icon: "📡" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: s.color, background: `${s.color}18`, padding: "2px 7px", borderRadius: 6, border: `1px solid ${s.color}33`, whiteSpace: "nowrap" }}>
      {s.icon} {channel}
    </span>
  );
};

const Ring = ({ score }: { score: string }) => {
  const s = parseFloat(score) || 0;
  return (
    <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(#0066ff ${(s / 10) * 360}deg, rgba(255,255,255,0.05) 0deg)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{s}</div>
    </div>
  );
};

const VoteBtn = ({ votes, onVote, voted }: { votes: number; onVote: () => void; voted: boolean }) => (
  <button onClick={(e) => { e.stopPropagation(); onVote(); }} style={{
    display: "flex", alignItems: "center", gap: 4, background: voted ? "rgba(0,102,255,0.15)" : "rgba(255,255,255,0.04)",
    border: voted ? "1px solid #0066ff" : "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 10px", cursor: "pointer",
    color: voted ? "#4d94ff" : "#999", fontSize: 12, fontWeight: 600,
  }}>
    <span>{voted ? "▲" : "△"}</span><span>{votes + (voted ? 1 : 0)}</span>
  </button>
);

/* ═══════════════════ COMPETITOR COMPONENTS ═══════════════════ */

function CompetitorPostCard({ post }: { post: CompetitorPost }) {
  const color = COMPETITOR_COLORS[post.competitor] || "#888";
  const platformIcon = PLATFORM_ICONS[post.platform] || "📡";
  const engagementColor = { alto: "#34d399", medio: "#fbbf24", bajo: "#f87171" }[post.engagement] || "#888";
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 10, marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{platformIcon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color, background: `${color}18`, padding: "1px 6px", borderRadius: 4, border: `1px solid ${color}33` }}>{post.platform}</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: "#888", background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 4 }}>{post.type}</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: engagementColor }}>● {post.engagement}</span>
            <span style={{ fontSize: 8, color: "#555" }}>{post.date}</span>
          </div>
          <p style={{ fontSize: 11, color: "#ccc", margin: "0 0 4px", lineHeight: 1.4 }}>{post.summary}</p>
          {post.copy && <p style={{ fontSize: 10, color: "#888", fontStyle: "italic", margin: "0 0 4px" }}>&quot;{post.copy}&quot;</p>}
          {post.opportunity && (
            <div style={{ fontSize: 9, color: "#4d94ff", background: "rgba(0,102,255,0.06)", padding: "4px 8px", borderRadius: 5, border: "1px solid rgba(0,102,255,0.15)", marginTop: 4 }}>
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
  const channelStyle = CHANNEL_STYLES[opp.channel] || { color: "#888", icon: "📡" };
  return (
    <div style={{ background: "rgba(0,102,255,0.04)", border: "1px solid rgba(0,102,255,0.12)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e5e5e5" }}>{opp.title}</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: urgencyColor, background: `${urgencyColor}18`, padding: "2px 6px", borderRadius: 10, border: `1px solid ${urgencyColor}33` }}>urgencia {opp.urgency}</span>
          </div>
          <p style={{ fontSize: 10, color: "#888", margin: "0 0 4px" }}>Trigger: {opp.trigger}</p>
          <p style={{ fontSize: 11, color: "#aaa", margin: 0, lineHeight: 1.4 }}>{opp.suggestion}</p>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: channelStyle.color, background: `${channelStyle.color}18`, padding: "2px 7px", borderRadius: 6, border: `1px solid ${channelStyle.color}33`, whiteSpace: "nowrap" }}>
            {channelStyle.icon} {opp.channel}
          </span>
          <button onClick={onNotion} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
            📋 Notion
          </button>
        </div>
      </div>
    </div>
  );
}

function CompetitorCard({ comp, open, toggle }: { comp: any; open: boolean; toggle: () => void }) {
  const color = COMPETITOR_COLORS[comp.name] || "#888";
  const activityColor = { alto: "#34d399", medio: "#fbbf24", bajo: "#f87171" }[comp.activityLevel as string] || "#888";
  const emoji = { "Chilexpress": "🟠", "Starken": "🔴", "Correos de Chile": "🔵" }[comp.name as string] || "⚫";
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}22`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
      <div onClick={toggle} style={{ padding: 14, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: `${color}18`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0" }}>{comp.name}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: activityColor, background: `${activityColor}18`, padding: "2px 6px", borderRadius: 10, border: `1px solid ${activityColor}33` }}>actividad {comp.activityLevel}</span>
            </div>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0", lineHeight: 1.3 }}>{comp.mainFocus}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "#555", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{(comp.posts || []).length} posts</span>
            <span style={{ color: "#444", fontSize: 12, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
          </div>
        </div>
        {comp.promos?.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
            {comp.promos.map((p: string, i: number) => (
              <span key={i} style={{ fontSize: 8, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(251,191,36,0.2)" }}>🏷️ {p}</span>
            ))}
          </div>
        )}
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {comp.toneShift && (
            <div style={{ fontSize: 10, color: "#f97316", background: "rgba(249,115,22,0.06)", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(249,115,22,0.15)", margin: "10px 0 4px" }}>
              ⚡ Cambio de tono: {comp.toneShift}
            </div>
          )}
          {(comp.posts || []).length === 0 && (
            <p style={{ fontSize: 11, color: "#555", margin: "10px 0 0", fontStyle: "italic" }}>Sin publicaciones recientes detectadas.</p>
          )}
          {(comp.posts || []).map((post: CompetitorPost, i: number) => (
            <CompetitorPostCard key={i} post={post} />
          ))}
        </div>
      )}
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px", color: "#fff" }}>Crear en Notion</h2>
            <p style={{ fontSize: 10, color: "#4d94ff", margin: 0, fontWeight: 600 }}>Líder de Negocio: Rodrigo Madariaga</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ background: "rgba(0,102,255,0.05)", border: "1px solid rgba(0,102,255,0.1)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5", marginBottom: 4 }}>📦 Blue: {campaign.title}</div>
          <div style={{ fontSize: 11, color: "#888" }}>Tendencia: {trend.title}</div>
          <p style={{ fontSize: 11, color: "#aaa", fontStyle: "italic", margin: "6px 0 0" }}>&quot;{campaign.copy}&quot;</p>
        </div>

        <label style={{ display: "block", fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 5, textTransform: "uppercase" }}>Sprint *</label>
        <input placeholder="Ej: Sprint 66" value={sprint} onChange={(e) => setSprint(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

        <label style={{ display: "block", fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 5, textTransform: "uppercase" }}>Fecha de Deploy *</label>
        <input type="date" value={deploy} onChange={(e) => setDeploy(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", colorScheme: "dark", marginBottom: 16 }} />

        <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>Tareas ({tasks.length})</div>
        {tasks.map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 12, color: "#ccc" }}>{t.name} <span style={{ color: "#666" }}>→ {TEAM[t.ownerKey].name}</span></span>
            <span style={{ fontSize: 10, color: deploy ? "#4d94ff" : "#444", fontFamily: "'JetBrains Mono', monospace" }}>{deploy ? offsetDate(deploy, t.offsetDays) : "—"}</span>
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          {status === "idle" && (
            <button onClick={go} disabled={!sprint || !deploy} style={{
              width: "100%", padding: 12, borderRadius: 10, border: "none",
              cursor: sprint && deploy ? "pointer" : "not-allowed",
              background: sprint && deploy ? "linear-gradient(135deg, #0044cc, #0066ff)" : "rgba(255,255,255,0.05)",
              color: sprint && deploy ? "#fff" : "#555", fontSize: 14, fontWeight: 700,
            }}>🚀 Crear campaña + {tasks.length} tareas</button>
          )}
          {status === "loading" && (
            <div style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 20, animation: "spin 1s linear infinite" }}>⏳</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>Creando en Notion...</div>
              <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {status === "success" && (
            <div style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399", marginTop: 4 }}>Creado en Notion</div>
              <button onClick={onClose} style={{ marginTop: 10, padding: "8px 24px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#ccc", fontSize: 12, cursor: "pointer" }}>Cerrar</button>
            </div>
          )}
          {status === "error" && (
            <div style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 28 }}>⚠️</div>
              <div style={{ fontSize: 13, color: "#f87171", marginTop: 4 }}>Error al crear</div>
              <button onClick={() => setStatus("idle")} style={{ marginTop: 10, padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#ccc", fontSize: 12, cursor: "pointer" }}>Reintentar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ CAMPAIGN CARD ═══════════════════ */

function CampaignCard({ c, trend, voted, onVote, onCreate }: {
  c: Campaign; trend: ScoredTrend; voted: boolean; onVote: () => void; onCreate: (c: Campaign, t: ScoredTrend) => void;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#e5e5e5" }}>{c.title}</span>
            <ChannelTag channel={c.channel} />
          </div>
          <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, margin: "0 0 6px", fontStyle: "italic" }}>&quot;{c.copy}&quot;</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: "#0066ff", fontWeight: 700, background: "rgba(0,102,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>{c.cta}</span>
            <span style={{ fontSize: 9, color: "#666" }}>📡 {c.estimatedReach}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <VoteBtn votes={c.votes} onVote={onVote} voted={voted} />
          <button onClick={(e) => { e.stopPropagation(); onCreate(c, trend); }} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
            background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
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
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden", marginBottom: 10, boxShadow: open ? "0 4px 20px rgba(0,0,0,0.3)" : "none" }}>
      <div onClick={toggle} style={{ padding: 14, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: "rgba(0,102,255,0.1)", border: "1px solid rgba(0,102,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{t.sourceIcon || "📡"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", margin: "0 0 4px", lineHeight: 1.25 }}>{t.title}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <EffortTag effort={t.effort || "M"} />
              {t.source === "Google Trends" && (
                <span style={{ fontSize: 8, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.12)", padding: "2px 6px", borderRadius: 10, border: "1px solid rgba(52,211,153,0.25)", whiteSpace: "nowrap" }}>Búsqueda activa</span>
              )}
              <span style={{ fontSize: 9, color: "#666" }}>{t.source} · {t.timestamp}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Ring score={avg} />
            <span style={{ color: "#444", fontSize: 12, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            <Score score={t.relevanceScore} label="Relev." />
            <Score score={t.viralScore} label="Viral" />
            <Score score={t.brandFitScore} label="Brand" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "#888" }}>🔥 {((t.volume || 0) / 1000).toFixed(1)}K</span>
            <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>{t.velocity}</span>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ fontSize: 11, color: "#999", lineHeight: 1.55, margin: "10px 0" }}>{t.summary}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", background: "rgba(0,102,255,0.05)", borderRadius: 7, border: "1px solid rgba(0,102,255,0.1)", marginBottom: 10 }}>
            <span style={{ fontSize: 11 }}>⏱️</span>
            <span style={{ fontSize: 10, color: "#4d94ff", fontWeight: 600 }}>Ventana: {t.timingWindow}</span>
            <span style={{ fontSize: 10, color: "#666" }}>· {(t.campaigns || []).length} propuestas</span>
          </div>
          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Propuestas de Campaña</div>
          {(t.campaigns || []).map((c) => (
            <CampaignCard key={c.id} c={c} trend={t} voted={votes.has(c.id)} onVote={() => onVote(c.id)} onCreate={onCreate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ MAIN PAGE ═══════════════════ */

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"tendencias" | "competencia">("tendencias");

  // Twitter/X trends state
  const [twitterTrends, setTwitterTrends] = useState<ScoredTrend[]>([]);
  const [twitterPhase, setTwitterPhase] = useState<"idle" | "fetching" | "scoring" | "done" | "error">("idle");
  const [twitterMsg, setTwitterMsg] = useState("");
  const [twitterExpanded, setTwitterExpanded] = useState<number | null>(null);
  const [twitterVotes, setTwitterVotes] = useState<Set<string>>(new Set());

  // Google Trends state
  const [googleTrends, setGoogleTrends] = useState<ScoredTrend[]>([]);
  const [googlePhase, setGooglePhase] = useState<"idle" | "fetching" | "scoring" | "done" | "error">("idle");
  const [googleMsg, setGoogleMsg] = useState("");
  const [googleExpanded, setGoogleExpanded] = useState<number | null>(null);
  const [googleVotes, setGoogleVotes] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<{ campaign: Campaign; trend: ScoredTrend } | null>(null);

  // Competencia state
  const [compData, setCompData] = useState<CompetitorAnalysis | null>(null);
  const [compPhase, setCompPhase] = useState<"idle" | "fetching" | "analyzing" | "done" | "error">("idle");
  const [compMsg, setCompMsg] = useState("");
  const [compExpanded, setCompExpanded] = useState<string | null>(null);

  const scanCompetitors = async () => {
    setCompPhase("fetching");
    setCompMsg("Escaneando competidores con IA...");
    setCompData(null);
    try {
      const analysis = await apiCompetitors();
      setCompData(analysis);
      setCompPhase("done");
      const postCount = (analysis.competitors || []).reduce((a: number, c: any) => a + (c.posts || []).length, 0);
      setCompMsg(`${postCount} publicaciones detectadas`);
    } catch (e: any) {
      setCompPhase("error");
      setCompMsg(e.message || "Error desconocido");
    }
  };

  const oppToNotion = (opp: CompetitiveOpportunity): { campaign: Campaign; trend: ScoredTrend } => ({
    campaign: { id: `opp-${opp.title}`, title: opp.title, channel: opp.channel, copy: opp.suggestion, cta: "Ver más", estimatedReach: "—", votes: 0 },
    trend: { id: 0, title: `Competencia: ${opp.trigger}`, source: "Competencia", sourceIcon: "🏁", category: "Competencia", summary: opp.suggestion, relevanceScore: 0, viralScore: 0, brandFitScore: 0, timingWindow: "—", effort: "M", volume: 0, velocity: "—", timestamp: "Ahora", campaigns: [] },
  });

  const scanTwitter = async () => {
    setTwitterPhase("fetching");
    setTwitterMsg("Obteniendo tendencias de trends24.in/chile...");
    setTwitterTrends([]);
    try {
      const raw = await apiScanTwitter();
      if (!raw.length) { setTwitterPhase("error"); setTwitterMsg("Sin tendencias en trends24.in"); return; }
      setTwitterPhase("scoring");
      setTwitterMsg(`Analizando ${raw.length} tendencias con Claude...`);
      const scored = await apiScore(raw);
      setTwitterTrends(scored);
      setTwitterPhase("done");
      setTwitterMsg(`${scored.length} tendencias`);
    } catch (e: any) {
      setTwitterPhase("error");
      setTwitterMsg(e.message || "Error desconocido");
    }
  };

  const scanGoogle = async () => {
    setGooglePhase("fetching");
    setGoogleMsg("Obteniendo búsquedas de Google Trends Chile...");
    setGoogleTrends([]);
    try {
      const raw = await apiScanGoogle();
      if (!raw.length) { setGooglePhase("error"); setGoogleMsg("Sin datos de Google Trends"); return; }
      setGooglePhase("scoring");
      setGoogleMsg(`Analizando ${raw.length} búsquedas con Claude...`);
      const scored = await apiScore(raw);
      setGoogleTrends(scored);
      setGooglePhase("done");
      setGoogleMsg(`${scored.length} búsquedas`);
    } catch (e: any) {
      setGooglePhase("error");
      setGoogleMsg(e.message || "Error desconocido");
    }
  };

  const voteTwitter = (id: string) => setTwitterVotes((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const voteGoogle = (id: string) => setGoogleVotes((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sortByScore = (arr: ScoredTrend[]) =>
    [...arr].sort((a, b) => {
      const sc = (t: ScoredTrend) => ((t.relevanceScore || 0) + (t.viralScore || 0) + (t.brandFitScore || 0)) / 3;
      return sc(b) - sc(a);
    });

  const anyLive = twitterPhase === "done" || googlePhase === "done";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: "'DM Sans', -apple-system, sans-serif", maxWidth: 720, margin: "0 auto" }}>

      {/* HEADER */}
      <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(0,102,255,0.04) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #0044cc, #0066ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}>⚡</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
            <span style={{ color: "#fff" }}>Trend Scout</span>
            <span style={{ color: "#0066ff", marginLeft: 5 }}>Agent</span>
          </h1>
          {(anyLive || compPhase === "done") && <span style={{ fontSize: 8, color: "#34d399", background: "rgba(52,211,153,0.15)", padding: "2px 7px", borderRadius: 12, fontWeight: 700 }}>LIVE</span>}
        </div>
        <p style={{ fontSize: 10, color: "#555", margin: "0 2px 2px" }}>Scraping real · Scoring IA · Push a Notion · Blue Express × Copec</p>
        <p style={{ fontSize: 10, color: "#4d94ff", margin: "0 0 10px", fontWeight: 600 }}>Líder de Negocio: Rodrigo Madariaga</p>

        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {([{ k: "tendencias", l: "📡 Tendencias" }, { k: "competencia", l: "🏁 Competencia" }] as const).map((tab) => (
            <button key={tab.k} onClick={() => setActiveTab(tab.k)} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
              border: activeTab === tab.k ? "1px solid #0066ff" : "1px solid rgba(255,255,255,0.08)",
              background: activeTab === tab.k ? "rgba(0,102,255,0.15)" : "transparent",
              color: activeTab === tab.k ? "#4d94ff" : "#555",
            }}>{tab.l}</button>
          ))}
        </div>

        {activeTab === "tendencias" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={scanTwitter}
              disabled={twitterPhase === "fetching" || twitterPhase === "scoring"}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: 10,
                border: "1px solid rgba(29,155,240,0.3)",
                cursor: twitterPhase === "fetching" || twitterPhase === "scoring" ? "not-allowed" : "pointer",
                background: twitterPhase === "fetching" || twitterPhase === "scoring" ? "rgba(255,255,255,0.05)" : "rgba(29,155,240,0.15)",
                color: twitterPhase === "fetching" || twitterPhase === "scoring" ? "#888" : "#1d9bf0",
                fontSize: 12, fontWeight: 700,
              }}
            >
              {twitterPhase === "idle" ? "𝕏 Escanear Twitter" : twitterPhase === "fetching" ? "📡 Buscando..." : twitterPhase === "scoring" ? "🧠 Scoring..." : twitterPhase === "error" ? "🔄 Reintentar 𝕏" : "🔄 Actualizar 𝕏"}
            </button>
            <button
              onClick={scanGoogle}
              disabled={googlePhase === "fetching" || googlePhase === "scoring"}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: 10,
                border: "1px solid rgba(52,211,153,0.25)",
                cursor: googlePhase === "fetching" || googlePhase === "scoring" ? "not-allowed" : "pointer",
                background: googlePhase === "fetching" || googlePhase === "scoring" ? "rgba(255,255,255,0.05)" : "rgba(52,211,153,0.1)",
                color: googlePhase === "fetching" || googlePhase === "scoring" ? "#888" : "#34d399",
                fontSize: 12, fontWeight: 700,
              }}
            >
              {googlePhase === "idle" ? "🔍 Escanear Google" : googlePhase === "fetching" ? "📡 Buscando..." : googlePhase === "scoring" ? "🧠 Scoring..." : googlePhase === "error" ? "🔄 Reintentar Google" : "🔄 Actualizar Google"}
            </button>
          </div>
        )}

        {activeTab === "competencia" && (
          <>
            <button onClick={scanCompetitors} disabled={compPhase === "fetching"} style={{
              width: "100%", padding: 12, borderRadius: 10, border: "none",
              cursor: compPhase === "fetching" ? "not-allowed" : "pointer",
              background: compPhase === "fetching" ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #550000, #991b1b)",
              color: compPhase === "fetching" ? "#888" : "#fff",
              fontSize: 14, fontWeight: 700, marginBottom: 10,
            }}>
              {compPhase === "idle" ? "🏁 Escanear competencia ahora" : compPhase === "fetching" ? "🧠 Escaneando con IA..." : compPhase === "error" ? "🔄 Reintentar" : "🏁 Nuevo escaneo de competencia"}
            </button>
            {compMsg && (
              <div style={{ fontSize: 11, color: compPhase === "error" ? "#f87171" : "#4d94ff", textAlign: "center", marginBottom: 8, padding: "6px 10px", background: "rgba(0,102,255,0.05)", borderRadius: 8 }}>
                {compMsg}
              </div>
            )}
          </>
        )}

      </div>

      {/* BRAND BAR */}
      {activeTab === "tendencias" && anyLive && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "6px 10px", background: "rgba(0,102,255,0.03)", borderRadius: 8, border: "1px solid rgba(0,102,255,0.06)" }}>
            <span style={{ fontSize: 8, color: "#555", fontWeight: 700, textTransform: "uppercase" }}>Marca</span>
            {BRAND.pillars.map((p, i) => <span key={i} style={{ fontSize: 8, color: "#4d94ff", background: "rgba(0,102,255,0.08)", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>{p}</span>)}
            <span style={{ fontSize: 8, color: "#f87171", fontWeight: 600 }}>✕ {BRAND.avoidances.join(", ")}</span>
          </div>
        </div>
      )}

      {/* ── TENDENCIAS TAB ── */}
      {activeTab === "tendencias" && (
        <div style={{ padding: "10px 10px 0" }}>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

          {/* ── TWITTER / X PANEL ── */}
          <div style={{ background: "rgba(29,155,240,0.04)", border: "1px solid rgba(29,155,240,0.15)", borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
            {/* Panel header */}
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(29,155,240,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(29,155,240,0.15)", border: "1px solid rgba(29,155,240,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#1d9bf0", fontWeight: 800 }}>𝕏</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#e5e5e5" }}>Twitter / X Trending</div>
                  <div style={{ fontSize: 9, color: "#555" }}>trends24.in/chile · Tiempo real</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {twitterPhase === "done" && <span style={{ fontSize: 9, color: "#1d9bf0", background: "rgba(29,155,240,0.12)", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>{twitterMsg}</span>}
                {twitterPhase === "error" && <span style={{ fontSize: 9, color: "#f87171" }}>{twitterMsg}</span>}
                <button
                  onClick={scanTwitter}
                  disabled={twitterPhase === "fetching" || twitterPhase === "scoring"}
                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: twitterPhase === "fetching" || twitterPhase === "scoring" ? "not-allowed" : "pointer", background: twitterPhase === "fetching" || twitterPhase === "scoring" ? "rgba(255,255,255,0.04)" : "rgba(29,155,240,0.12)", border: "1px solid rgba(29,155,240,0.25)", color: twitterPhase === "fetching" || twitterPhase === "scoring" ? "#666" : "#1d9bf0", whiteSpace: "nowrap" }}
                >
                  {twitterPhase === "idle" ? "Escanear" : twitterPhase === "fetching" ? "📡 Buscando..." : twitterPhase === "scoring" ? "🧠 Scoring..." : twitterPhase === "error" ? "🔄 Reintentar" : "🔄 Actualizar"}
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ padding: twitterTrends.length > 0 ? "10px 10px 10px" : "0" }}>
              {twitterPhase === "idle" && (
                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>𝕏</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#444", marginBottom: 4 }}>Tendencias en Twitter Chile</div>
                  <div style={{ fontSize: 11, color: "#333" }}>Datos en tiempo real desde trends24.in/chile</div>
                </div>
              )}
              {(twitterPhase === "fetching" || twitterPhase === "scoring") && (
                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                  <div style={{ fontSize: 32, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>{twitterPhase === "fetching" ? "📡" : "🧠"}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1d9bf0" }}>{twitterPhase === "fetching" ? "Scrapeando trends24.in..." : "Analizando con Claude..."}</div>
                </div>
              )}
              {twitterPhase === "done" && sortByScore(twitterTrends).map((t) => (
                <TrendCard key={t.id} t={t} open={twitterExpanded === t.id} toggle={() => setTwitterExpanded(twitterExpanded === t.id ? null : t.id)} votes={twitterVotes} onVote={voteTwitter} onCreate={(c, tr) => setModal({ campaign: c, trend: tr })} />
              ))}
            </div>
          </div>

          {/* ── GOOGLE TRENDS PANEL ── */}
          <div style={{ background: "rgba(52,211,153,0.03)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
            {/* Panel header */}
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(52,211,153,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🔍</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#e5e5e5" }}>Google Trends Chile</div>
                  <div style={{ fontSize: 9, color: "#555" }}>trends.google.es · Últimas 24 horas</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {googlePhase === "done" && <span style={{ fontSize: 9, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>{googleMsg}</span>}
                {googlePhase === "error" && <span style={{ fontSize: 9, color: "#f87171" }}>{googleMsg}</span>}
                <button
                  onClick={scanGoogle}
                  disabled={googlePhase === "fetching" || googlePhase === "scoring"}
                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: googlePhase === "fetching" || googlePhase === "scoring" ? "not-allowed" : "pointer", background: googlePhase === "fetching" || googlePhase === "scoring" ? "rgba(255,255,255,0.04)" : "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: googlePhase === "fetching" || googlePhase === "scoring" ? "#666" : "#34d399", whiteSpace: "nowrap" }}
                >
                  {googlePhase === "idle" ? "Escanear" : googlePhase === "fetching" ? "📡 Buscando..." : googlePhase === "scoring" ? "🧠 Scoring..." : googlePhase === "error" ? "🔄 Reintentar" : "🔄 Actualizar"}
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ padding: googleTrends.length > 0 ? "10px 10px 10px" : "0" }}>
              {googlePhase === "idle" && (
                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#444", marginBottom: 4 }}>Búsquedas trending en Chile</div>
                  <div style={{ fontSize: 11, color: "#333" }}>Intención de búsqueda activa — últimas 24 horas</div>
                </div>
              )}
              {(googlePhase === "fetching" || googlePhase === "scoring") && (
                <div style={{ textAlign: "center", padding: "30px 20px" }}>
                  <div style={{ fontSize: 32, marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>{googlePhase === "fetching" ? "📡" : "🧠"}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>{googlePhase === "fetching" ? "Consultando Google Trends RSS..." : "Analizando con Claude..."}</div>
                </div>
              )}
              {googlePhase === "done" && sortByScore(googleTrends).map((t) => (
                <TrendCard key={t.id} t={t} open={googleExpanded === t.id} toggle={() => setGoogleExpanded(googleExpanded === t.id ? null : t.id)} votes={googleVotes} onVote={voteGoogle} onCreate={(c, tr) => setModal({ campaign: c, trend: tr })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── COMPETENCIA TAB ── */}
      {activeTab === "competencia" && (
        <div style={{ padding: "12px 10px" }}>
          {compPhase === "idle" && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#555", marginBottom: 8 }}>Monitor de Competencia</div>
              <div style={{ fontSize: 12, color: "#444", maxWidth: 300, margin: "0 auto" }}>Detecta campañas activas de {COMPETITORS.map((c) => c.name).join(", ")} y genera oportunidades reactivas para Blue Express.</div>
            </div>
          )}
          {compPhase === "fetching" && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }}>🧠</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4d94ff" }}>Escaneando y analizando competidores...</div>
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
            </div>
          )}
          {compPhase === "done" && compData && (
            <>
              {/* Summary */}
              {compData.summary && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>Panorama Competitivo</div>
                  <p style={{ fontSize: 12, color: "#ccc", margin: 0, lineHeight: 1.5 }}>{compData.summary}</p>
                </div>
              )}

              {/* Opportunities */}
              {compData.opportunities?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>Oportunidades Reactivas ({compData.opportunities.length})</div>
                  {compData.opportunities.map((opp, i) => (
                    <OpportunityCard key={i} opp={opp} onNotion={() => setModal(oppToNotion(opp))} />
                  ))}
                </div>
              )}

              {/* Competitor summary cards */}
              <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>Actividad por Competidor</div>
              {compData.competitors?.map((comp) => (
                <CompetitorCard key={comp.name} comp={comp} open={compExpanded === comp.name} toggle={() => setCompExpanded(compExpanded === comp.name ? null : comp.name)} />
              ))}
            </>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
        <span style={{ fontSize: 9, color: "#333" }}>Trend Scout v1.0 · Blue Express × Copec Digital</span>
      </div>

      {modal && <NotionModal campaign={modal.campaign} trend={modal.trend} onClose={() => setModal(null)} />}
    </div>
  );
}
