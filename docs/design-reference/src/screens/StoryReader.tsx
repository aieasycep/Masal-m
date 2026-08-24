import { useState } from "react"

interface Props {
  onBack: () => void
}

const pages = [
  {
    emoji: "🌌",
    bg: "linear-gradient(160deg, #1A0F3C, #3D2080)",
    text: "Ege küçük uzay giysisini giydi ve rokete atladı. Gökyüzü karanlıktı ama orada, milyonlarca yıldızın arasında, küçük bir ışık yanıp sönüyordu.",
    highlight: null,
  },
  {
    emoji: "🚀",
    bg: "linear-gradient(160deg, #0D1B2E, #1E3A5F)",
    text: "\"Seni bulacağım,\" diye fısıldadı Ege, roketin motorlarını çalıştırırken. Küçük yıldız sanki onu duymuş gibi biraz daha parlak yanıp söndü.",
    highlight: "Seni bulacağım",
  },
  {
    emoji: "⭐",
    bg: "linear-gradient(160deg, #2D1B69, #5A3FA8)",
    text: "Saatlerce süren bir yolculuktan sonra Ege o küçük yıldıza ulaştı. Yıldız, evini özlediği için ağlıyordu. \"Korkma,\" dedi Ege, \"seni evine götüreceğim.\"",
    highlight: "Korkma",
  },
  {
    emoji: "🌟",
    bg: "linear-gradient(160deg, #0F2A1A, #1A5235)",
    text: "Birlikte uçarken yıldız giderek parlamaya başladı. Ve o gece bütün gökyüzü, Ege'nin cesaretini kutlar gibi pırıl pırıl parlıyordu.",
    highlight: null,
  },
  {
    emoji: "🌙",
    bg: "linear-gradient(160deg, #1A0F3C, #2D1B69)",
    text: "Ege yatağına döndüğünde pencereden baktı. En parlak yıldız ona göz kırpıyordu. \"İyi geceler Ege,\" diye fısıldıyordu sanki. \"İyi geceler,\" diye fısıldadı Ege ve gözlerini yumdu.",
    highlight: "İyi geceler Ege",
  },
]

export default function StoryReader({ onBack }: Props) {
  const [currentPage, setCurrentPage] = useState(0)
  const [audioMode] = useState(true)
  const page = pages[currentPage]

  const goNext = () => setCurrentPage((p) => Math.min(p + 1, pages.length - 1))
  const goPrev = () => setCurrentPage((p) => Math.max(p - 1, 0))

  return (
    <div
      style={{
        width: "100%",
        height: 844,
        background: page.bg,
        display: "flex",
        flexDirection: "column",
        transition: "background 0.6s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Stars */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 2,
            height: 2,
            borderRadius: "50%",
            background: "white",
            opacity: 0.2 + (i % 4) * 0.1,
            top: `${(i * 53 + 7) % 60}%`,
            left: `${(i * 71 + 11) % 100}%`,
            animation: `pulse-soft ${1.5 + (i % 3)}s ease infinite`,
            animationDelay: `${(i * 0.4) % 2}s`,
          }}
        />
      ))}

      {/* Header */}
      <div
        style={{
          padding: "52px 20px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "Nunito", fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Ege ve Kayıp Yıldız
          </p>
          <p style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "2px 0 0", fontWeight: 700 }}>
            Sayfa {currentPage + 1} / {pages.length}
          </p>
        </div>

        {/* Audio indicator */}
        {audioMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 12px", backdropFilter: "blur(8px)" }}>
            <div style={{ display: "flex", gap: 2, alignItems: "center", height: 16 }}>
              {[1,2,3,4].map((i) => (
                <div
                  key={i}
                  className="wave-bar"
                  style={{ width: 3, borderRadius: 2, background: "#B09CE0", minHeight: 4 }}
                />
              ))}
            </div>
            <span style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
              🎙 Anne
            </span>
          </div>
        )}
      </div>

      {/* Page dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "16px 0 0", position: "relative", zIndex: 2 }}>
        {pages.map((_, i) => (
          <div
            key={i}
            onClick={() => setCurrentPage(i)}
            style={{
              width: i === currentPage ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === currentPage ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              transition: "all 0.3s ease",
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* Illustration */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 32px",
          position: "relative",
          zIndex: 2,
        }}
        key={`illo-${currentPage}`}
      >
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: 40,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 100,
            backdropFilter: "blur(4px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            animation: "fadeIn 0.5s ease both, float 4s ease-in-out infinite",
          }}
        >
          {page.emoji}
        </div>
      </div>

      {/* Text area */}
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "24px 28px 40px",
          position: "relative",
          zIndex: 2,
          minHeight: 200,
        }}
        key={`text-${currentPage}`}
      >
        <p
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 17,
            color: "rgba(255,255,255,0.92)",
            lineHeight: 1.8,
            margin: "0 0 24px",
            fontStyle: "italic",
            animation: "fadeUp 0.4s ease both",
          }}
          dangerouslySetInnerHTML={{
            __html: page.highlight
              ? page.text.replace(
                  page.highlight,
                  `<span style="color:#FFD97D;font-style:normal;font-weight:600">${page.highlight}</span>`
                )
              : page.text,
          }}
        />

        {/* Page navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={goPrev}
            disabled={currentPage === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 12,
              padding: "10px 18px",
              color: currentPage === 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.8)",
              fontFamily: "Nunito",
              fontSize: 14,
              fontWeight: 700,
              cursor: currentPage === 0 ? "default" : "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Önceki
          </button>

          <span style={{ fontFamily: "Nunito", fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
            {currentPage + 1} / {pages.length}
          </span>

          <button
            onClick={goNext}
            disabled={currentPage === pages.length - 1}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: currentPage === pages.length - 1 ? "rgba(255,255,255,0.05)" : "rgba(176,156,224,0.3)",
              border: `1px solid ${currentPage === pages.length - 1 ? "rgba(255,255,255,0.1)" : "rgba(176,156,224,0.4)"}`,
              borderRadius: 12,
              padding: "10px 18px",
              color: currentPage === pages.length - 1 ? "rgba(255,255,255,0.25)" : "white",
              fontFamily: "Nunito",
              fontSize: 14,
              fontWeight: 700,
              cursor: currentPage === pages.length - 1 ? "default" : "pointer",
            }}
          >
            Sonraki
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
