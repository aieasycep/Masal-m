import { useState } from "react"

interface Props {
  onBack: () => void
  onGenerate: () => void
}

const styles = [
  {
    id: "watercolor",
    name: "Suluboya",
    desc: "Yumuşak, akıcı renkler",
    emoji: "🎨",
    colors: ["#B8D8E8", "#D4C8F0", "#F5C4A8"],
  },
  {
    id: "3d",
    name: "Yumuşak 3D",
    desc: "Sıcak, hacimli figürler",
    emoji: "🧸",
    colors: ["#F5C4A8", "#FFD97D", "#C5DFC8"],
  },
  {
    id: "classic",
    name: "Klasik Masal",
    desc: "Geleneksel illüstrasyon",
    emoji: "📖",
    colors: ["#D4A574", "#8B6914", "#5C3D1E"],
  },
  {
    id: "pastel",
    name: "Pastel",
    desc: "Hafif ve huzur verici",
    emoji: "🌸",
    colors: ["#F0C9D4", "#C9E0F0", "#D4F0C9"],
  },
  {
    id: "handdrawn",
    name: "El Çizimi",
    desc: "Sıcak, kişisel dokunuş",
    emoji: "✏️",
    colors: ["#2C2825", "#8A7D72", "#FAF8F4"],
  },
]

export default function IllustrationStyle({ onBack, onGenerate }: Props) {
  const [selected, setSelected] = useState("watercolor")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)

  const pageLabels = ["Kapak", "Sayfa 1", "Sayfa 2", "Sayfa 3", "Sayfa 4", "Sayfa 5"]

  const handleGenerate = () => {
    setGenerating(true)
    const interval = setInterval(() => {
      setCurrentPage((p) => {
        if (p >= pageLabels.length - 1) {
          clearInterval(interval)
          setTimeout(onGenerate, 600)
          return p
        }
        return p + 1
      })
      setProgress((p) => Math.min(p + 100 / pageLabels.length, 100))
    }, 900)
  }

  if (generating) {
    return (
      <div
        style={{
          width: "100%",
          height: 844,
          background: "linear-gradient(160deg, #1A0F3C, #2D1B69, #0D1B2E)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: "40px 32px",
        }}
      >
        {/* Spinning palette */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: "rgba(176,156,224,0.15)",
            border: "2px solid rgba(176,156,224,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            animation: "spin-slow 4s linear infinite",
          }}
        >
          🎨
        </div>

        <div style={{ textAlign: "center" }}>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, color: "white", margin: "0 0 8px" }}>
            Görseller oluşturuluyor…
          </h3>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "rgba(176,156,224,0.8)", margin: 0, fontWeight: 500 }}>
            {pageLabels[currentPage]} hazırlanıyor
          </p>
        </div>

        {/* Page progress */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          {pageLabels.map((label, i) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: i <= currentPage ? 1 : 0.35,
                transition: "opacity 0.4s ease",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: i < currentPage ? "rgba(141,184,154,0.3)" : i === currentPage ? "rgba(176,156,224,0.3)" : "rgba(255,255,255,0.08)",
                  border: `1px solid ${i < currentPage ? "rgba(141,184,154,0.6)" : i === currentPage ? "rgba(176,156,224,0.6)" : "rgba(255,255,255,0.15)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 12,
                }}
              >
                {i < currentPage ? "✓" : i === currentPage ? (
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#B09CE0", animation: "pulse-soft 1s ease infinite" }} />
                ) : ""}
              </div>
              <span style={{ fontFamily: "Nunito", fontSize: 14, fontWeight: 600, color: i < currentPage ? "#8DB89A" : i === currentPage ? "#B09CE0" : "rgba(255,255,255,0.4)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, #9B7FD4, #FFD97D)", borderRadius: 2, transition: "width 0.8s ease" }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)", paddingBottom: 120 }} className="screen-scroll">
      {/* Header */}
      <div style={{ padding: "52px 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Masalını Resimlendir
            </p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>
              İllüstrasyon stili seç
            </h1>
          </div>
        </div>

        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(124,92,191,0.08)", border: "1px solid rgba(124,92,191,0.15)" }}>
          <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--foreground)", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
            ✨ Her sayfa için yapay zekâ yeni bir görsel oluşturacak. Kahramanın görünümü kitap boyunca tutarlı kalacak.
          </p>
        </div>
      </div>

      {/* Style cards */}
      <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {styles.map((style) => (
          <div
            key={style.id}
            onClick={() => setSelected(style.id)}
            style={{
              borderRadius: 20,
              border: `2px solid ${selected === style.id ? "var(--primary)" : "var(--border)"}`,
              background: selected === style.id ? "var(--secondary)" : "white",
              overflow: "hidden",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: selected === style.id ? "0 4px 16px rgba(124,92,191,0.15)" : "none",
            }}
          >
            <div style={{ display: "flex" }}>
              {/* Color strips */}
              <div style={{ display: "flex", width: 96, flexShrink: 0 }}>
                {style.colors.map((c, i) => (
                  <div key={i} style={{ flex: 1, background: c }} />
                ))}
              </div>
              {/* Info */}
              <div style={{ flex: 1, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 32 }}>{style.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 600, color: "var(--foreground)", margin: "0 0 2px" }}>
                    {style.name}
                  </p>
                  <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                    {style.desc}
                  </p>
                </div>
                {selected === style.id && (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "16px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)" }}>
        <button
          onClick={handleGenerate}
          style={{
            width: "100%",
            padding: "18px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
            border: "none",
            color: "white",
            fontFamily: "Nunito",
            fontSize: 17,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(124,92,191,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span>🎨</span>
          Görselleri Oluştur
        </button>
        <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", margin: "8px 0 0", fontWeight: 500 }}>
          6 görsel oluşturulacak · 1–2 dakika sürebilir
        </p>
      </div>
    </div>
  )
}
