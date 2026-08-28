import { useState } from "react"

interface Props {
  onBack: () => void
  onDone?: () => void
}

const coverPalettes = [
  { id: "purple", gradient: "linear-gradient(135deg, #2D1B69, #7C5CBF)", label: "Mor Büyü" },
  { id: "ocean", gradient: "linear-gradient(135deg, #0F2040, #1E6B8A)", label: "Okyanus" },
  { id: "forest", gradient: "linear-gradient(135deg, #0F2A1A, #2D6A4F)", label: "Orman" },
  { id: "sunset", gradient: "linear-gradient(135deg, #3D1A0A, #C4622D)", label: "Günbatımı" },
  { id: "night", gradient: "linear-gradient(135deg, #0D1B2E, #1C3F6E)", label: "Gece" },
]

export default function CoverEditor({ onBack, onDone }: Props) {
  const [title, setTitle] = useState("Ege ve Kayıp Yıldız")
  const [subtitle, setSubtitle] = useState("Büyülü Ormanın Gizemli Macerası")
  const [dedication, setDedication] = useState("Annem'e sevgiyle")
  const [palette, setPalette] = useState("purple")
  const [activeField, setActiveField] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const currentPalette = coverPalettes.find((p) => p.id === palette) || coverPalettes[0]

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => { setSaved(false); if (onDone) onDone() }, 1500)
  }

  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Book/02-CoverEditor</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Kapak Tasarımı</h1>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 120px" }} className="screen-scroll">
        {/* Cover preview */}
        <div style={{ width: "100%", height: 280, borderRadius: 24, background: currentPalette.gradient, marginBottom: 22, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 16px 48px rgba(0,0,0,0.25)", position: "relative", overflow: "hidden" }}>
          {/* Star deco */}
          {[{x:10,y:15,s:5},{x:85,y:20,s:4},{x:20,y:75,s:3},{x:90,y:80,s:5},{x:50,y:10,s:3}].map((s,i) => (
            <div key={i} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, borderRadius: "50%", background: "rgba(255,255,255,0.6)" }} />
          ))}
          <div style={{ fontSize: 64 }}>⭐</div>
          <p style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 700, color: "white", margin: 0, textAlign: "center", padding: "0 24px", lineHeight: 1.2, textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{title || "Kitap Başlığı"}</p>
          {subtitle && <p style={{ fontFamily: "Nunito", fontSize: 12, color: "rgba(255,255,255,0.75)", margin: 0, textAlign: "center", padding: "0 28px", fontWeight: 500, lineHeight: 1.4 }}>{subtitle}</p>}
          {dedication && (
            <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center" }}>
              <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0, fontStyle: "italic" }}>{dedication}</p>
            </div>
          )}
        </div>

        {/* Color palette */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Kapak Rengi</p>
          <div style={{ display: "flex", gap: 10 }}>
            {coverPalettes.map((p) => (
              <div key={p.id} onClick={() => setPalette(p.id)} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ height: 48, borderRadius: 12, background: p.gradient, border: `3px solid ${palette === p.id ? "var(--primary)" : "transparent"}`, transition: "border-color 0.2s ease" }} />
                <p style={{ fontFamily: "Nunito", fontSize: 9, fontWeight: 700, color: palette === p.id ? "var(--primary)" : "var(--muted-foreground)", textAlign: "center", margin: "4px 0 0" }}>{p.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Fields */}
        {[
          { key: "title", label: "Kitap Başlığı", value: title, set: setTitle, placeholder: "Hikâyenin başlığı" },
          { key: "subtitle", label: "Alt Başlık", value: subtitle, set: setSubtitle, placeholder: "İsteğe bağlı alt başlık" },
          { key: "dedication", label: "İthaf", value: dedication, set: setDedication, placeholder: "Kime ithaf ediyorsun?" },
        ].map((field) => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>{field.label}</label>
            <input
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder={field.placeholder}
              onFocus={() => setActiveField(field.key)}
              onBlur={() => setActiveField(null)}
              style={{ width: "100%", padding: "16px 18px", borderRadius: 16, border: `2px solid ${activeField === field.key ? "var(--primary)" : "var(--border)"}`, fontFamily: "Nunito", fontSize: 15, color: "var(--foreground)", background: "white", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s ease", fontWeight: 600 }}
            />
          </div>
        ))}

        {/* Cover image replacement — Kapak Görselini Değiştir */}
        <div>
          <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>Kapak Görselini Değiştir</label>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ flex: 1, padding: "14px 12px", borderRadius: 16, background: "white", border: "1.5px solid var(--border)", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              🔄 Yeniden Oluştur
            </button>
            <button style={{ flex: 1, padding: "14px 12px", borderRadius: 16, background: "white", border: "1.5px solid var(--border)", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              🖼 Alternatiflerden Seç
            </button>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "12px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)" }}>
        <button onClick={handleSave} style={{ width: "100%", padding: "18px", borderRadius: 20, background: saved ? "rgba(141,184,154,0.15)" : "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: saved ? "#8DB89A" : "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: saved ? "none" : "0 8px 24px rgba(124,92,191,0.3)", transition: "all 0.3s ease" }}>
          {saved ? "✓ Kaydedildi" : "Kapağı Kaydet"}
        </button>
      </div>
    </div>
  )
}
