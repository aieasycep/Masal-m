interface Props {
  featureName: string
  description?: string
  onUpgrade: () => void
  onDismiss: () => void
}

export default function PremiumSheet({ featureName, description, onUpgrade, onDismiss }: Props) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", zIndex: 300 }}
      onClick={onDismiss}
    >
      <div
        style={{ width: 390, background: "white", borderRadius: "24px 24px 0 0", padding: "20px 24px 48px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />

        {/* Crown badge */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #F5D080, #F0A56E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, boxShadow: "0 8px 24px rgba(240,165,110,0.35)" }}>
            👑
          </div>
        </div>

        {/* Badge/Premium label */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 800, color: "#C07840", background: "rgba(240,165,110,0.15)", borderRadius: 8, padding: "4px 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Badge/Premium
          </span>
        </div>

        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: "0 0 10px", textAlign: "center", lineHeight: 1.3 }}>
          Bu özellik Premium'a özel.
        </h3>
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", margin: "0 0 8px", lineHeight: 1.6, fontWeight: 500 }}>
          <strong style={{ color: "var(--foreground)" }}>{featureName}</strong>
          {description ? ` — ${description}` : " özelliğini kullanmak için Premium'a geçebilirsin."}
        </p>

        {/* Feature highlights */}
        <div style={{ padding: "14px 16px", borderRadius: 16, background: "var(--muted)", margin: "16px 0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {["Anne ve baba sesiyle anlatım", "Sınırsız hikâye oluşturma", "AI illüstrasyon"].map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg, #F5D080, #F0A56E)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <span style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{f}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onUpgrade}
            style={{ width: "100%", padding: "18px", borderRadius: 18, background: "linear-gradient(135deg, #F5D080, #F08B6E)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(240,139,110,0.35)" }}
          >
            ✨ Premium'u İncele
          </button>
          <button
            onClick={onDismiss}
            style={{ width: "100%", padding: "14px", borderRadius: 18, background: "none", border: "none", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--muted-foreground)", cursor: "pointer" }}
          >
            Şimdilik Değil
          </button>
        </div>
      </div>
    </div>
  )
}
