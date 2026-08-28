import { useState } from "react"

interface Props {
  onBack: () => void
}

const initialPages = [
  "Ege küçük uzay giysisini giydi ve rokete atladı. Gökyüzü karanlıktı ama orada, milyonlarca yıldızın arasında, küçük bir ışık yanıp sönüyordu.",
  "\"Seni bulacağım,\" diye fısıldadı Ege, roketin motorlarını çalıştırırken. Küçük yıldız sanki onu duymuş gibi biraz daha parlak yanıp söndü.",
  "Saatlerce süren bir yolculuktan sonra Ege o küçük yıldıza ulaştı. Yıldız, evini özlediği için ağlıyordu. \"Korkma,\" dedi Ege, \"seni evine götüreceğim.\"",
  "Birlikte uçarken yıldız giderek parlamaya başladı. Ve o gece bütün gökyüzü, Ege'nin cesaretini kutlar gibi pırıl pırıl parlıyordu.",
  "Ege yatağına döndüğünde pencereden baktı. En parlak yıldız ona göz kırpıyordu. \"İyi geceler Ege,\" diye fısıldıyordu sanki. \"İyi geceler,\" diye fısıldadı Ege ve gözlerini yumdu.",
]

export default function StoryEdit({ onBack }: Props) {
  const [pages, setPages] = useState(initialPages)
  const [selectedPage, setSelectedPage] = useState(0)
  const [saved, setSaved] = useState(false)
  const [title, setTitle] = useState("Ege ve Kayıp Yıldız")

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      style={{
        width: "100%",
        height: 844,
        background: "var(--background)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "52px 20px 16px",
          background: "var(--background)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button
            onClick={onBack}
            style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: "0 0 2px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Hikâyeyi Düzenle
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "var(--foreground)", background: "none", border: "none", outline: "none", width: "100%", padding: 0 }}
            />
          </div>
          <button
            onClick={handleSave}
            style={{
              padding: "8px 16px",
              borderRadius: 12,
              background: saved ? "rgba(141,184,154,0.15)" : "var(--primary)",
              border: "none",
              color: saved ? "#8DB89A" : "white",
              fontFamily: "Nunito",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.3s ease",
              flexShrink: 0,
            }}
          >
            {saved ? "✓ Kaydedildi" : "Kaydet"}
          </button>
        </div>

        {/* Page tabs */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setSelectedPage(i)}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                borderRadius: 10,
                background: selectedPage === i ? "var(--primary)" : "white",
                border: selectedPage === i ? "none" : "1px solid var(--border)",
                color: selectedPage === i ? "white" : "var(--muted-foreground)",
                fontFamily: "Nunito",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Sayfa {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Edit area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }} className="screen-scroll">
        {/* Illustration placeholder */}
        <div
          style={{
            borderRadius: 20,
            background: "linear-gradient(135deg, #D4C8F0, #EDE8F8)",
            height: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 20,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <span style={{ fontSize: 60 }}>
            {["🌌", "🚀", "⭐", "🌟", "🌙"][selectedPage]}
          </span>
          <div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", gap: 8 }}>
            <button
              style={{ padding: "6px 12px", borderRadius: 10, background: "rgba(255,255,255,0.8)", border: "none", fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--primary)", cursor: "pointer" }}
            >
              🎨 Yeniden Oluştur
            </button>
          </div>
        </div>

        {/* Text editor */}
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sayfa {selectedPage + 1} metni
          </p>
          <textarea
            value={pages[selectedPage]}
            onChange={(e) => {
              const updated = [...pages]
              updated[selectedPage] = e.target.value
              setPages(updated)
            }}
            rows={6}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 16,
              border: "2px solid var(--border)",
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              color: "var(--foreground)",
              lineHeight: 1.7,
              background: "white",
              outline: "none",
              resize: "none",
              boxSizing: "border-box",
              fontStyle: "italic",
            }}
          />
          <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 24px", fontWeight: 500 }}>
            {pages[selectedPage].length} karakter
          </p>
        </div>

        {/* AI regenerate */}
        <div
          style={{
            padding: "16px",
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(176,156,224,0.12), rgba(124,92,191,0.08))",
            border: "1px solid rgba(124,92,191,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 24 }}>✨</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--primary)", margin: "0 0 2px" }}>
              Yapay zekâyla yeniden yaz
            </p>
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
              Bu sayfanın metnini AI ile iyileştir
            </p>
          </div>
          <button
            style={{ padding: "8px 14px", borderRadius: 10, background: "var(--primary)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            Yaz
          </button>
        </div>
      </div>
    </div>
  )
}
