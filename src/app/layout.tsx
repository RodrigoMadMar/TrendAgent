import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trend Scout Agent — Blue Express",
  description: "Monitoreo de tendencias + scoring IA + campañas Notion para Blue Express",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0a0a0a" }}>{children}</body>
    </html>
  );
}
