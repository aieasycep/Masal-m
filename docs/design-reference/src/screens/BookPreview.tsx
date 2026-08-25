import { useState } from "react"

interface Props {
  onBack: () => void
  onPrint: () => void
}

const bookPages = [
  { id: "cover", label: "Ön Kapak", gradient: "linear-gradient(135deg, #2D1B69, #7C5CBF)", emoji: "⭐", title: "Ege ve Kayıp Yıldız", subtitle: "Ege için özel bir masal", iscover: true },
  { id: "p1", label: "Sayfa 1", gradient: "linear-gradient(135deg, #0F2A1A, #2D6A4F)", emoji: "🌲", text: "Bir zamanlar, yıldızların en parlak olduğu bir gecede, Ege adında meraklı bir çocuk vardı." },
  { id: "p2", label: "Sayfa 2", gradient: "linear-gradient(135deg, #1B2B4D, #2D4A8A)", emoji: "🌟", text: "Ege her gece penceresinden gökyüzüne bakardı. O gece bir yıldızın kaybolduğunu fark etti." },
  { id: "p3", label: "Sayfa 3", gradient: "linear-gradient(135deg, #3D1A0A, #8B4513)", emoji: "🏡", text: "Cesaretle yola çıktı. Ormanların içinden geçti, dağları aştı, nehirleri geçti." },
  { id: "p4", label: "Sayfa 4", gradient: "linear-gradient(135deg, #1A1A4D, #6B21A8)", emoji: "🌈", text: "Ve sonunda o kayıp yıldızı buldu — tam kalbinin içinde saklıydı." },
  { id: "p5", label: "Sayfa 5", gradient: "linear-gradient(135deg, #2D1B69, #9B7FD4)", emoji: "✨", text: "O geceden sonra Ege anladı: En büyük macera, kendi kalbindeki ışığı keşfetmektir." },
  { id: "backcover", label: "Arka Kapak", gradient: "linear-gradient(135deg, #1A1A2E, #2D1B69)", emoji: "📚", isback: true },
]

export default function BookPreview({ onBack, onPrint }: Props) {
  const [currentPage, setCurrentPage] = useState(0)
  const page = bookPages[currentPage]

  const goNext = () => { if (currentPage < bookPages.length - 1) setCurrentPage((p) => p + 1) }
  const goPrev = () => { if (currentPage > 0) setCurrentPage((p) => p - 1) }

  return (
    <div style={{ width: "100%", height: 844, background: "#1A1A2E", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "52px 24px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Book/03-Preview</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: "white", margin: 0 }}>Kitap Önizlemesi</h1>
        </div>
        <span style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{currentPage + 1}/{bookPages.length}</span>
      </div>

      {/* Book page canvas */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", position: "relative" }}>
        {/* Left arrow */}
        {currentPage > 0 && (
          <button onClick={goPrev} style={{ position: "absolute", left: 8, width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}

        {/* Book page */}
        <div style={{ width: 270, height: 360, borderRadius: currentPage === 0 ? "4px 16px 16px 4px" : "4px 16px 16px 4px", background: page.gradient, boxShadow: "12px 12px 40px rgba(0,0,0,0.5), -2px 0 0 rgba(0,0,0,0.3)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 24px" }}>
          {/* Spine */}
          <div style={{ position: "absolute", left: 0, top: 0, width: 14, height: "100%", background: "rgba(0,0,0,0.25)", borderRadius: "4px 0 0 4px" }} />

          {/* Star particles */}
          {[{x:15,y:12,s:3},{x:80,y:18,s:2},{x:70,y:75,s:3},{x:20,y:80,s:2},{x:90,y:45,s:2}].map((star,i) => (
            <div key={i} style={{ position: "absolute", left: `${star.x}%`, top: `${star.y}%`, width: star.s, height: star.s, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />
          ))}

          {/* Cover */}
          {(page as any).iscover && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 72, marginBottom: 16, animation: "float 4s ease-in-out infinite" }}>{page.emoji}</div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 700, color: "white", margin: "0 0 8px", lineHeight: 1.2, textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{page.title}</h2>
              <p style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.75)", margin: "0 0 20px", fontWeight: 500 }}>{page.subtitle}</p>
              <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, fontStyle: "italic" }}>Anne ve babasından sevgiyle.</p>
            </div>
          )}

          {/* Back cover */}
          {(page as any).isback && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{page.emoji}</div>
              <p style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: "rgba(255,255,255,0.75)", margin: "0 0 16px", lineHeight: 1.6, fontStyle: "italic" }}>"Her çocuk kendi hikâyesinin kahramanıdır."</p>
              <div style={{ width: 60, height: 1, background: "rgba(255,255,255,0.2)", margin: "0 auto 12px" }} />
              <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Masalım</p>
            </div>
          )}

          {/* Inner pages */}
          {!(page as any).iscover && !(page as any).isback && (
            <>
              <div style={{ fontSize: 56, marginBottom: 20, animation: "float 4s ease-in-out infinite" }}>{page.emoji}</div>
              <p style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: "white", textAlign: "center", lineHeight: 1.7, margin: 0, fontWeight: 400 }}>{page.text}</p>
              <p style={{ position: "absolute", bottom: 16, right: 20, fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>{currentPage}</p>
            </>
          )}
        </div>

        {/* Right arrow */}
        {currentPage < bookPages.length - 1 && (
          <button onClick={goNext} style={{ position: "absolute", right: 8, width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>

      {/* Page dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "12px 0", flexShrink: 0 }}>
        {bookPages.map((_, i) => (
          <div key={i} onClick={() => setCurrentPage(i)} style={{ width: i === currentPage ? 20 : 6, height: 6, borderRadius: 3, background: i === currentPage ? "white" : "rgba(255,255,255,0.25)", transition: "all 0.25s ease", cursor: "pointer" }} />
        ))}
      </div>

      {/* Page label */}
      <p style={{ fontFamily: "Nunito", fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "0 0 12px", fontWeight: 600 }}>{page.label}</p>

      {/* CTA buttons */}
      <div style={{ padding: "0 24px 40px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <button onClick={onPrint} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #F0A56E, #F08B6E)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(240,139,110,0.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          🖨 Kitabı Bastır
        </button>
        <button onClick={onBack} style={{ width: "100%", padding: "16px", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)", fontFamily: "Nunito", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Düzenlemeye Dön
        </button>
      </div>
    </div>
  )
}
