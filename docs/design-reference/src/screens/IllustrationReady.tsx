import { useState } from "react"
import ErrorState from "../components/ErrorState"

interface Props {
  onBack: () => void
  onDone?: () => void
}

type PageView = "ready" | "alternatives" | "regenerating" | "error"

const pages = [
  { id: "cover", label: "Kapak", emoji: "⭐", gradient: "linear-gradient(135deg, #2D1B69, #7C5CBF)", text: "" },
  { id: "p1", label: "Sayfa 1", emoji: "🌲", gradient: "linear-gradient(135deg, #0F2A1A, #2D6A4F)", text: "Ormanın derinliklerinde küçük bir köpek yavrusu…" },
  { id: "p2", label: "Sayfa 2", emoji: "🌟", gradient: "linear-gradient(135deg, #1B2B4D, #2D4A8A)", text: "Gökyüzünde parlayan yıldızlar ona rehberlik etti." },
  { id: "p3", label: "Sayfa 3", emoji: "🏡", gradient: "linear-gradient(135deg, #3D1A0A, #8B4513)", text: "Sonunda ışıklı bir ev görünce umut doldu yüreği." },
  { id: "p4", label: "Sayfa 4", emoji: "🌈", gradient: "linear-gradient(135deg, #1A1A4D, #6B21A8)", text: "Ve o gün öğrendi: cesaret, sevginin en güçlü formu." },
]

const altStyles = [
  { emoji: "🖼", label: "Suluboya", gradient: "linear-gradient(135deg, #F5D0A9, #F08B6E)" },
  { emoji: "🎨", label: "Pastel", gradient: "linear-gradient(135deg, #D4C8F0, #9B7FD4)" },
  { emoji: "✏️", label: "El Çizimi", gradient: "linear-gradient(135deg, #C8E6C9, #4CAF50)" },
  { emoji: "🌊", label: "Yumuşak 3D", gradient: "linear-gradient(135deg, #BBDEFB, #2196F3)" },
]

export default function IllustrationReady({ onBack, onDone }: Props) {
  const [view, setView] = useState<PageView>("ready")
  const [selectedPage, setSelectedPage] = useState(0)
  const [regeneratingProgress, setRegeneratingProgress] = useState(0)
  const [altSelected, setAltSelected] = useState(0)

  const startRegenerate = () => {
    setView("regenerating")
    setRegeneratingProgress(0)
    const iv = setInterval(() => {
      setRegeneratingProgress((p) => {
        if (p >= 100) { clearInterval(iv); setTimeout(() => setView("ready"), 400); return 100 }
        return p + 8
      })
    }, 120)
  }

  // ─── ERROR ────────────────────────────────────────────────────
  if (view === "error") return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Illustration/Error</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Görseller Hazırlanamadı</h1>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <ErrorState
          variant="illustration"
          onRetry={() => setView("ready")}
        />
      </div>
    </div>
  )

  // ─── ALTERNATIVES ─────────────────────────────────────────────
  if (view === "alternatives") return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setView("ready")} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Illustration/04-Alternatives</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Alternatif Görseller</h1>
        </div>
      </div>
      <div style={{ padding: "0 24px", flex: 1, overflowY: "auto" }} className="screen-scroll">
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: "0 0 18px", fontWeight: 500 }}>
          <strong style={{ color: "var(--foreground)" }}>{pages[selectedPage].label}</strong> için 4 farklı stil seçeneği
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          {altStyles.map((alt, i) => (
            <div key={alt.label} onClick={() => setAltSelected(i)} style={{ borderRadius: 20, overflow: "hidden", border: `3px solid ${altSelected === i ? "var(--primary)" : "transparent"}`, cursor: "pointer", transition: "border-color 0.2s ease" }}>
              <div style={{ height: 140, background: alt.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>
                {pages[selectedPage].emoji}
              </div>
              <div style={{ padding: "10px 12px", background: "white" }}>
                <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: altSelected === i ? "var(--primary)" : "var(--foreground)", margin: 0 }}>{alt.label}</p>
              </div>
              {altSelected === i && (
                <div style={{ position: "absolute" }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "12px 24px 48px" }}>
        <button onClick={() => setView("ready")} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.3)" }}>
          Bu Görseli Seç
        </button>
      </div>
    </div>
  )

  // ─── REGENERATING ─────────────────────────────────────────────
  if (view === "regenerating") return (
    <div style={{ width: "100%", height: 844, background: "#0D1B2E", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
      <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Illustration/05-Regenerating</p>
      {/* Background image with overlay */}
      <div style={{ position: "relative", width: 240, height: 240, borderRadius: 28, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: pages[selectedPage].gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>
          {pages[selectedPage].emoji}
        </div>
        <div style={{ position: "absolute", inset: 0, background: "rgba(13,27,46,0.7)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", border: "4px solid rgba(155,127,212,0.3)", borderTopColor: "#9B7FD4", animation: "spin-slow 1s linear infinite" }} />
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600, margin: 0 }}>Yeni görsel oluşturuluyor</p>
        </div>
      </div>
      <div style={{ width: 280 }}>
        <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${regeneratingProgress}%`, borderRadius: 3, background: "linear-gradient(90deg, #9B7FD4, #7C5CBF)", transition: "width 0.12s ease" }} />
        </div>
        <p style={{ fontFamily: "Nunito", fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "8px 0 0", fontWeight: 500 }}>{regeneratingProgress}%</p>
      </div>
    </div>
  )

  // ─── READY ────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Illustration/03-Ready</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Görseller Hazır ✨</h1>
        </div>
      </div>

      {/* Page thumbnail strip */}
      <div style={{ overflowX: "auto", padding: "0 24px 16px", display: "flex", gap: 10, scrollbarWidth: "none" }}>
        {pages.map((page, i) => (
          <div key={page.id} onClick={() => setSelectedPage(i)} style={{ flexShrink: 0, width: 64, cursor: "pointer" }}>
            <div style={{ width: 64, height: 80, borderRadius: 10, background: page.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, border: `3px solid ${selectedPage === i ? "var(--primary)" : "transparent"}`, transition: "border-color 0.2s ease", boxShadow: selectedPage === i ? "0 4px 12px rgba(124,92,191,0.3)" : "0 2px 6px rgba(0,0,0,0.1)" }}>
              {page.emoji}
            </div>
            <p style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: selectedPage === i ? "var(--primary)" : "var(--muted-foreground)", textAlign: "center", margin: "5px 0 0" }}>{page.label}</p>
          </div>
        ))}
      </div>

      {/* Main illustration */}
      <div style={{ margin: "0 24px", borderRadius: 24, background: pages[selectedPage].gradient, height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", position: "relative", overflow: "hidden" }}>
        <span style={{ fontSize: 80, animation: "float 4s ease-in-out infinite" }}>{pages[selectedPage].emoji}</span>
        {pages[selectedPage].text && (
          <p style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "center", margin: 0, padding: "0 24px", fontWeight: 500, lineHeight: 1.5 }}>{pages[selectedPage].text}</p>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "16px 24px 0", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={startRegenerate} style={{ flex: 1, padding: "14px", borderRadius: 16, background: "white", border: "1px solid var(--border)", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            🔄 Yeniden Oluştur
          </button>
          <button onClick={() => setView("alternatives")} style={{ flex: 1, padding: "14px", borderRadius: 16, background: "white", border: "1px solid var(--border)", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            🖼 Alternatifler
          </button>
        </div>
        {/* Error state demo trigger */}
        <button onClick={() => setView("error")} style={{ width: "100%", padding: "12px", borderRadius: 14, background: "rgba(224,84,84,0.06)", border: "1px dashed rgba(224,84,84,0.25)", fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "#E05454", cursor: "pointer" }}>
          ⚠ Hata Durumunu Göster (demo)
        </button>
      </div>
      <div style={{ padding: "12px 24px 40px" }}>
        <button onClick={onDone} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.3)" }}>
          Kitabı Oluştur 📚
        </button>
      </div>
    </div>
  )
}
