"use client";

import { useState } from "react";
import { BRAND, TEAM, getTasksForChannel, offsetDate } from "@/lib/constants";
import type { ScoredTrend, Campaign } from "@/lib/constants";

/* ═══════════════════ API CALLS (to our proxy routes) ═══════════════════ */

async function apiScan(): Promise<any[]> {
  const res = await fetch("/api/scan", { method: "POST" });
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
            <span style={{ fontSize: 8, color: "#0066ff", background: "rgba(0,102,255,0.1)", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>{c.channel}</span>
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
  const [trends, setTrends] = useState<ScoredTrend[]>([]);
  const [phase, setPhase] = useState<"idle" | "fetching" | "scoring" | "done" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [votes, setVotes] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");
  const [modal, setModal] = useState<{ campaign: Campaign; trend: ScoredTrend } | null>(null);

  const scan = async () => {
    setPhase("fetching");
    setStatusMsg("Scrapeando tendencias de Chile...");
    setTrends([]);
    try {
      const raw = await apiScan();
      if (!raw.length) { setPhase("error"); setStatusMsg("No se encontraron tendencias."); return; }
      setPhase("scoring");
      setStatusMsg(`Analizando ${raw.length} tendencias con Claude...`);
      const scored = await apiScore(raw);
      setTrends(scored);
      setPhase("done");
      setStatusMsg(`${scored.length} tendencias listas`);
    } catch (e: any) {
      setPhase("error");
      setStatusMsg(e.message || "Error desconocido");
    }
  };

  const vote = (id: string) => setVotes((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const categories = ["all", ...new Set(trends.map((t) => t.category).filter(Boolean))];
  const filtered = trends
    .filter((t) => filter === "all" || t.category === filter)
    .sort((a, b) => {
      const sc = (t: ScoredTrend) => ((t.relevanceScore || 0) + (t.viralScore || 0) + (t.brandFitScore || 0)) / 3;
      if (sortBy === "score") return sc(b) - sc(a);
      if (sortBy === "volume") return (b.volume || 0) - (a.volume || 0);
      return (b.brandFitScore || 0) - (a.brandFitScore || 0);
    });

  const totalIdeas = trends.reduce((a, t) => a + (t.campaigns || []).length, 0);
  const avg = trends.length ? (trends.reduce((a, t) => a + ((t.relevanceScore || 0) + (t.viralScore || 0) + (t.brandFitScore || 0)) / 3, 0) / trends.length).toFixed(1) : "—";

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
          {phase === "done" && <span style={{ fontSize: 8, color: "#34d399", background: "rgba(52,211,153,0.15)", padding: "2px 7px", borderRadius: 12, fontWeight: 700 }}>LIVE</span>}
        </div>
        <p style={{ fontSize: 10, color: "#555", margin: "0 2px 2px" }}>Scraping real · Scoring IA · Push a Notion · Blue Express × Copec</p>
        <p style={{ fontSize: 10, color: "#4d94ff", margin: "0 0 12px", fontWeight: 600 }}>Líder de Negocio: Rodrigo Madariaga</p>

        <button onClick={scan} disabled={phase === "fetching" || phase === "scoring"} style={{
          width: "100%", padding: 12, borderRadius: 10, border: "none",
          cursor: phase === "fetching" || phase === "scoring" ? "not-allowed" : "pointer",
          background: phase === "fetching" || phase === "scoring" ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #0044cc, #0066ff)",
          color: phase === "fetching" || phase === "scoring" ? "#888" : "#fff",
          fontSize: 14, fontWeight: 700, marginBottom: 10,
        }}>
          {phase === "idle" ? "🔍 Escanear tendencias ahora" : phase === "fetching" ? "📡 Buscando..." : phase === "scoring" ? "🧠 Scoring con IA..." : phase === "error" ? "🔄 Reintentar" : "🔍 Nuevo escaneo"}
        </button>

        {statusMsg && (
          <div style={{ fontSize: 11, color: phase === "error" ? "#f87171" : "#4d94ff", textAlign: "center", marginBottom: 8, padding: "6px 10px", background: "rgba(0,102,255,0.05)", borderRadius: 8 }}>
            {statusMsg}
          </div>
        )}

        {trends.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
              {[
                { v: trends.length, l: "Trends", i: "📡" },
                { v: totalIdeas, l: "Ideas", i: "💡" },
                { v: votes.size, l: "Votos", i: "🗳️" },
                { v: avg, l: "Avg", i: "⭐" },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center", padding: "6px 2px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 9 }}>{s.i}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{s.v}</div>
                  <div style={{ fontSize: 7, color: "#555", textTransform: "uppercase" }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
              {categories.map((c) => (
                <button key={c} onClick={() => setFilter(c)} style={{
                  padding: "4px 11px", borderRadius: 14, whiteSpace: "nowrap", flexShrink: 0,
                  border: filter === c ? "1px solid #0066ff" : "1px solid rgba(255,255,255,0.08)",
                  background: filter === c ? "rgba(0,102,255,0.15)" : "transparent",
                  color: filter === c ? "#4d94ff" : "#777", fontSize: 10, fontWeight: 600, cursor: "pointer",
                }}>{c === "all" ? "Todas" : c}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
              <span style={{ fontSize: 9, color: "#555" }}>Ordenar:</span>
              {[{ k: "score", l: "Score" }, { k: "volume", l: "Volumen" }, { k: "brandFit", l: "Brand Fit" }].map((s) => (
                <button key={s.k} onClick={() => setSortBy(s.k)} style={{
                  padding: "3px 8px", borderRadius: 5,
                  border: sortBy === s.k ? "1px solid rgba(0,102,255,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  background: sortBy === s.k ? "rgba(0,102,255,0.1)" : "transparent",
                  color: sortBy === s.k ? "#4d94ff" : "#666", fontSize: 9, fontWeight: 600, cursor: "pointer",
                }}>{s.l}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* BRAND BAR */}
      {trends.length > 0 && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "6px 10px", background: "rgba(0,102,255,0.03)", borderRadius: 8, border: "1px solid rgba(0,102,255,0.06)" }}>
            <span style={{ fontSize: 8, color: "#555", fontWeight: 700, textTransform: "uppercase" }}>Marca</span>
            {BRAND.pillars.map((p, i) => <span key={i} style={{ fontSize: 8, color: "#4d94ff", background: "rgba(0,102,255,0.08)", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>{p}</span>)}
            <span style={{ fontSize: 8, color: "#f87171", fontWeight: 600 }}>✕ {BRAND.avoidances.join(", ")}</span>
          </div>
        </div>
      )}

      {/* STATES */}
      {phase === "idle" && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#555", marginBottom: 8 }}>Listo para escanear</div>
          <div style={{ fontSize: 12, color: "#444", maxWidth: 300, margin: "0 auto" }}>Presiona el botón para buscar tendencias reales en X Chile, LimaLimón y farándula.</div>
        </div>
      )}
      {(phase === "fetching" || phase === "scoring") && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }}>{phase === "fetching" ? "📡" : "🧠"}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#4d94ff" }}>{phase === "fetching" ? "Scrapeando fuentes..." : "Scoring con Claude..."}</div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
        </div>
      )}

      {/* CARDS */}
      {phase === "done" && (
        <div style={{ padding: "12px 10px" }}>
          {filtered.map((t) => (
            <TrendCard key={t.id} t={t} open={expanded === t.id} toggle={() => setExpanded(expanded === t.id ? null : t.id)} votes={votes} onVote={vote} onCreate={(c, tr) => setModal({ campaign: c, trend: tr })} />
          ))}
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
