import { useState } from "react"

interface Props {
  onBack: () => void
  onPrint: () => void
}

const pages = [
  { label: "Kapak", emoji: "⭐", bg: "linear-gradient(135deg, #2D1B69, #7C5CBF)", text: "Ege ve Kayıp Yıldız" },
  { label: "Sayfa 1", emoji: "🌌", bg: "linear-gradient(135deg, #1A0F3C, #3D2080)", text: "Ege küçük uzay giysisini giydi ve rokete atladı…" },
  { label: "Sayfa 2", emoji: "🚀", bg: "linear-gradient(135deg, #0D1B2E, #1E3A5F)", text: "\"Seni bulacağım,\" diye fısıldadı Ege…" },
  { label: "Sayfa 3", emoji: "⭐", bg: "linear-gradient(135deg, #2D1B69, #5A3FA8)", text: "Saatlerce süren bir yolculuktan sonra Ege o küçük yıldıza ulaştı…" },
  { label: "Sayfa 4", emoji: "🌟", bg: "linear-gradient(135deg, #0F2A1A, #1A5235)", text: "Birlikte uçarken yıldız giderek parlamaya başladı…" },
  { label: "Arka Kapak", emoji: "🌙", bg: "linear-gradient(135deg, #1A0F3C, #2D1B69)", text: "" },
]

export default function BookBuilder({ onBack, onPrint }: Props) {
  const [currentPage, setCurrentPage] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const page = pages[currentPage]

  if (showPreview) {
    return (
      <div style={{ width: "100%", height: 844, background: "#1A1A2E", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowPreview(false)} style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Kitap Önizleme</p>
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 16, color: "white", margin: 0, fontWeight: 600 }}>Ege ve Kayıp Yıldız</p>
          </div>
        </div>

        {/* 3D Book mockup */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ position: "relative" }}>
            {/* Book shadow */}
            <div style={{ position: "absolute", bottom: -20, left: "10%", width: "80%", height: 20, background: "rgba(0,0,0,0.5)", borderRadius: "50%", filter: "blur(10px)" }} />
            {/* Spine */}
            <div style={{ position: "absolute", left: 0, top: 8, width: 20, height: 280, background: "#5A4190", borderRadius: "4px 0 0 4px", transform: "perspective(400px) rotateY(-30deg)", transformOrigin: "right center" }} />
            {/* Book cover */}
            <div
              style={{
                width: 220,
                height: 280,
                borderRadius: "4px 12px 12px 4px",
                background: "linear-gradient(160deg, #2D1B69, #7C5CBF)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "8px 8px 32px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.1)",
                position: "relative",
                overflow: "hidden",
                marginLeft: 16,
              }}
            >
              {/* Stars on cover */}
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ position: "absolute", width: 2, height: 2, borderRadius: "50%", background: "white", opacity: 0.3 + (i % 4) * 0.15, top: `${(i * 53 + 7) % 80}%`, left: `${(i * 71 + 11) % 100}%` }} />
              ))}
              <span style={{ fontSize: 72, marginBottom: 16 }}>⭐</span>
              <p style={{ fontFamily: "Fraunces, serif", fontSize: 16, fontWeight: 600, color: "white", textAlign: "center", margin: "0 0 6px", padding: "0 16px", lineHeight: 1.3 }}>Ege ve Kayıp Yıldız</p>
              <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Ege için özel olarak hazırlandı</p>
              <div style={{ position: "absolute", bottom: 16, right: 0, left: 0, textAlign: "center" }}>
                <p style={{ fontFamily: "Nunito", fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>MASALIM</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: "0 24px 48px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onPrint}
            style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <span>📦</span> Kitabı Bastır
          </button>
          <button
            onClick={() => setShowPreview(false)}
            style={{ width: "100%", padding: "16px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Düzenle
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "52px 20px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Kitap Editörü</p>
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Ege'nin Kitabı</p>
          </div>
          <button
            onClick={() => setShowPreview(true)}
            style={{ padding: "8px 14px", borderRadius: 12, background: "var(--secondary)", border: "none", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--primary)", cursor: "pointer" }}
          >
            Önizle
          </button>
        </div>

        {/* Page thumbnails */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
          {pages.map((p, i) => (
            <div
              key={i}
              onClick={() => setCurrentPage(i)}
              style={{
                flexShrink: 0,
                width: 52,
                height: 68,
                borderRadius: 8,
                background: p.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                cursor: "pointer",
                border: `2px solid ${currentPage === i ? "var(--primary)" : "transparent"}`,
                boxShadow: currentPage === i ? "0 0 0 1px var(--primary)" : "none",
                fontSize: 18,
              }}
            >
              {p.emoji}
              <span style={{ fontFamily: "Nunito", fontSize: 8, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{p.label.replace("Sayfa ", "S")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", overflow: "hidden" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            aspectRatio: "3/4",
            borderRadius: 16,
            background: page.bg,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
            position: "relative",
          }}
        >
          {/* Stars */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", width: 2, height: 2, borderRadius: "50%", background: "white", opacity: 0.3, top: `${(i * 47) % 60}%`, left: `${(i * 73) % 100}%` }} />
          ))}

          {/* Illustration area */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
            <span style={{ fontSize: currentPage === 0 ? 80 : 64 }}>{page.emoji}</span>
          </div>

          {/* Text area */}
          {currentPage !== pages.length - 1 && (
            <div style={{ background: "rgba(0,0,0,0.45)", padding: "16px", backdropFilter: "blur(8px)" }}>
              <p style={{ fontFamily: "Fraunces, serif", fontSize: currentPage === 0 ? 16 : 13, color: "white", margin: 0, lineHeight: 1.5, fontStyle: currentPage === 0 ? "normal" : "italic", fontWeight: currentPage === 0 ? 600 : 400 }}>
                {page.text}
              </p>
              {currentPage === 0 && (
                <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "8px 0 0", fontWeight: 600 }}>Ege için özel olarak hazırlandı</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit toolbar */}
      <div style={{ padding: "0 20px 32px", display: "flex", gap: 8 }}>
        {[
          { icon: "🎨", label: "Görseli Yeniden Oluştur" },
          { icon: "🔄", label: "Farklı Görsel" },
          { icon: "✏️", label: "Metni Düzenle" },
        ].map((action) => (
          <button
            key={action.label}
            style={{
              flex: 1,
              padding: "12px 6px",
              borderRadius: 14,
              background: "white",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 18 }}>{action.icon}</span>
            <span style={{ fontFamily: "Nunito", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center", lineHeight: 1.2 }}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Print CTA */}
      <div style={{ padding: "0 20px 40px" }}>
        <button
          onClick={onPrint}
          style={{ width: "100%", padding: "16px", borderRadius: 18, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 20px rgba(124,92,191,0.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          📦 Kitabı Bastır
        </button>
      </div>
    </div>
  )
}
