import { useState } from "react"

interface Props {
  onBack: () => void
  mode?: "paywall" | "quota"
}

const features = [
  { icon: "✨", text: "Sınırsız hikâye oluşturma" },
  { icon: "🎙", text: "Anne ve baba sesi klonlama" },
  { icon: "🎨", text: "Yapay zeka ile illüstrasyon" },
  { icon: "📚", text: "Sınırsız kütüphane depolama" },
  { icon: "📖", text: "Sesli kitap modu" },
  { icon: "🖨", text: "Fiziksel kitap baskısı" },
]

export default function Subscription({ onBack, mode = "paywall" }: Props) {
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly")
  const [loading, setLoading] = useState(false)

  const handleSubscribe = () => {
    setLoading(true)
    setTimeout(() => { setLoading(false); onBack() }, 1800)
  }

  // ─── QUOTA REACHED ────────────────────────────────────────────
  if (mode === "quota") return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 0", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--muted)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 20, textAlign: "center" }}>
        <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Subscription/02-QuotaReached</p>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(240,139,110,0.12)", border: "2px solid rgba(240,139,110,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42 }}>🚀</div>
        <div>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: "0 0 10px", lineHeight: 1.2 }}>Bu ay 3 hikâye hakkın doldu!</h2>
          <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>Masalım Premium ile sınırsız hikâye oluştur, çocuğun için sonsuz macera yarat.</p>
        </div>
        <div style={{ width: "100%", padding: "16px 18px", borderRadius: 18, background: "white", border: "1px solid var(--border)" }}>
          {features.slice(0, 3).map((f) => (
            <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <span style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--foreground)", fontWeight: 600 }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "0 24px 48px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={handleSubscribe} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #F0A56E, #F08B6E)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(240,139,110,0.35)" }}>
          Premium'u İncele
        </button>
        <button onClick={onBack} style={{ width: "100%", padding: "14px", borderRadius: 18, background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--muted-foreground)", cursor: "pointer" }}>Daha Sonra</button>
      </div>
    </div>
  )

  // ─── PAYWALL ──────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)" }} className="screen-scroll">
      <div style={{ background: "linear-gradient(160deg, #2D1B69 0%, #7C5CBF 100%)", padding: "52px 24px 32px", position: "relative", overflow: "hidden" }}>
        {/* Star particles */}
        {[{x:10,y:20,s:6},{x:80,y:10,s:4},{x:50,y:60,s:5},{x:30,y:80,s:3},{x:90,y:70,s:6}].map((star,i) => (
          <div key={i} style={{ position: "absolute", left: `${star.x}%`, top: `${star.y}%`, width: star.s, height: star.s, borderRadius: "50%", background: "rgba(255,255,255,0.6)", animation: "pulse-soft 2s ease-in-out infinite", animationDelay: `${i*0.4}s` }} />
        ))}
        <button onClick={onBack} style={{ position: "absolute", top: 52, right: 24, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Subscription/01-Paywall</p>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>✨</span>
          <span style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 800, color: "#F0D080", letterSpacing: "0.1em", textTransform: "uppercase" }}>Masalım Premium</span>
        </div>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 30, fontWeight: 700, color: "white", margin: "0 0 10px", lineHeight: 1.2 }}>Sınırsız masal, sınırsız büyü ✨</h1>
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>Çocuğunun büyülü dünyasını yıldızlarla doldur.</p>
      </div>

      <div style={{ padding: "24px 24px 0" }}>
        {/* Features */}
        <div style={{ background: "white", borderRadius: 20, border: "1px solid var(--border)", padding: "20px 18px", marginBottom: 20 }}>
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Premium Özellikler</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {features.map((f) => (
              <div key={f.text} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{f.icon}</span>
                <span style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--foreground)", fontWeight: 600, lineHeight: 1.4 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan toggle */}
        <div style={{ display: "flex", background: "var(--muted)", borderRadius: 16, padding: 4, marginBottom: 14 }}>
          {(["monthly", "yearly"] as const).map((p) => (
            <button key={p} onClick={() => setPlan(p)} style={{ flex: 1, padding: "10px", borderRadius: 12, background: plan === p ? "white" : "transparent", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: plan === p ? "var(--foreground)" : "var(--muted-foreground)", cursor: "pointer", transition: "all 0.2s ease", boxShadow: plan === p ? "0 2px 8px rgba(0,0,0,0.1)" : "none" }}>
              {p === "monthly" ? "Aylık" : "Yıllık"}
              {p === "yearly" && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#8DB89A", background: "rgba(141,184,154,0.12)", borderRadius: 6, padding: "2px 6px" }}>%40 İndirim</span>}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {[
            { key: "monthly", label: "Aylık Plan", price: "₺149", period: "/ay", desc: "İstediğin zaman iptal et" },
            { key: "yearly", label: "Yıllık Plan", price: "₺89", period: "/ay", desc: "₺1.068/yıl · 2 ay ücretsiz", badge: "En Popüler" },
          ].filter((p) => plan === "yearly" ? true : p.key === "monthly").map((p) => (
            <div key={p.key} onClick={() => setPlan(p.key as "monthly" | "yearly")} style={{ padding: "16px 18px", borderRadius: 18, background: "white", border: `2px solid ${plan === p.key ? "var(--primary)" : "var(--border)"}`, cursor: "pointer", position: "relative" }}>
              {p.badge && <div style={{ position: "absolute", top: -10, right: 16, fontFamily: "Nunito", fontSize: 10, fontWeight: 800, color: "white", background: "linear-gradient(135deg, #F08B6E, #e07a5f)", borderRadius: 8, padding: "3px 10px" }}>{p.badge}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 2px" }}>{p.label}</p>
                  <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{p.desc}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: plan === p.key ? "var(--primary)" : "var(--foreground)" }}>{p.price}</span>
                  <span style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>{p.period}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 24px 48px" }}>
        <button onClick={handleSubscribe} style={{ width: "100%", padding: "18px", borderRadius: 20, background: loading ? "var(--secondary)" : "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: loading ? "var(--primary)" : "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: loading ? "none" : "0 8px 24px rgba(124,92,191,0.35)", transition: "all 0.3s ease" }}>
          {loading ? "İşleniyor…" : `Premium'a Başla${plan === "yearly" ? " — ₺89/ay" : " — ₺149/ay"}`}
        </button>
        <button onClick={() => {}} style={{ width: "100%", padding: "12px", background: "none", border: "none", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--primary)", cursor: "pointer", marginTop: 4 }}>
          Satın alımları geri yükle
        </button>
        <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", margin: "4px 0 0", fontWeight: 500 }}>İstediğin zaman iptal edebilirsin. Abonelik otomatik yenilenir.</p>
      </div>
    </div>
  )
}
