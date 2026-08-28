import { useState } from "react"
import PremiumSheet from "../components/PremiumSheet"

interface Props {
  onBack: () => void
  onDone: () => void
  onVoiceStudio: () => void
  onSubscription?: () => void
}

type VoiceStatus = "ready" | "processing" | "error" | "unset"

interface VoiceOption {
  id: string; label: string; name: string; type: "personal" | "system"; emoji: string; status: VoiceStatus; desc?: string;
}

const voices: VoiceOption[] = [
  { id: "mom", label: "Anne", name: "Annemin Sesi", type: "personal", emoji: "👩", status: "ready" },
  { id: "dad", label: "Baba", name: "Babamın Sesi", type: "personal", emoji: "👨", status: "processing" },
  { id: "luna", label: "Luna", name: "Masalsı ve huzurlu", type: "system", emoji: "🌙", status: "ready", desc: "Sakin" },
  { id: "atlas", label: "Atlas", name: "Sıcak ve güven veren", type: "system", emoji: "🌊", status: "ready", desc: "Neşeli" },
  { id: "duru", label: "Duru", name: "Yumuşak masal anlatıcısı", type: "system", emoji: "⭐", status: "ready", desc: "Masalsı" },
]

type PreviewState = "idle" | "loading" | "playing"

export default function NarrationSelect({ onBack, onDone, onVoiceStudio, onSubscription }: Props) {
  const [selected, setSelected] = useState<string | null>("mom")
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>("idle")
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(false)
  const [showPremiumSheet, setShowPremiumSheet] = useState(false)

  const handlePreview = (id: string) => {
    if (previewing === id) {
      setPreviewing(null); setPreviewState("idle"); return
    }
    setPreviewing(id); setPreviewState("loading")
    setTimeout(() => setPreviewState("playing"), 800)
    setTimeout(() => { setPreviewing(null); setPreviewState("idle") }, 4000)
  }

  const handleGenerate = () => {
    setGenerating(true)
    setTimeout(() => { setGenerating(false); setDone(true) }, 2500)
  }

  if (done) {
    const voice = voices.find((v) => v.id === selected)!
    return (
      <div style={{ width: "100%", height: 844, background: "linear-gradient(160deg, #1A0F3C, #2D1B69, #0D1B2E)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", gap: 24 }}>
        {["#FFD97D", "#F08B6E", "#8DB89A", "#B09CE0"].map((c, i) => (
          <div key={i} style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: c, top: `${20 + i * 14}%`, left: `${12 + i * 20}%`, animation: `float ${2 + i * 0.4}s ease-in-out infinite` }} />
        ))}
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(141,184,154,0.2)", border: "2px solid rgba(141,184,154,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🎉</div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: "white", margin: "0 0 8px" }}>Seslendirme hazır!</h2>
          <p style={{ fontFamily: "Nunito", fontSize: 15, color: "rgba(176,156,224,0.8)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
            Hikâye artık <strong style={{ color: "white" }}>{voice.label}</strong> sesiyle anlatılıyor.
          </p>
        </div>
        <button onClick={onDone} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.4)" }}>
          Dinlemeye Başla
        </button>
        <button onClick={onBack} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>Hikâyeye Dön</button>
      </div>
    )
  }

  if (generating) {
    return (
      <div style={{ width: "100%", height: 844, background: "linear-gradient(160deg, #1A0F3C, #2D1B69, #0D1B2E)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "40px 32px" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(176,156,224,0.15)", border: "2px solid rgba(176,156,224,0.3)", display: "flex", alignItems: "center", justifyContent: "center", animation: "spin-slow 3s linear infinite" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B09CE0" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="10" /></svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 600, color: "white", margin: "0 0 8px" }}>Seslendirme oluşturuluyor…</h3>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "rgba(176,156,224,0.7)", margin: 0, fontWeight: 500 }}>Hikâyen, {voices.find((v) => v.id === selected)?.label} sesiyle hazırlanıyor.</p>
        </div>
      </div>
    )
  }

  const hasCustomVoices = voices.some((v) => v.type === "personal" && v.status === "ready")
  const selectedVoice = voices.find((v) => v.id === selected)
  const canSelect = selectedVoice && selectedVoice.status === "ready"

  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "52px 24px 16px", background: "linear-gradient(180deg, rgba(176,156,224,0.1) 0%, transparent 100%)", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Narration/01-SelectVoice</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Hikâyeyi kim anlatsın?</h1>
          </div>
        </div>
        {/* Story info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "white", borderRadius: 14, border: "1px solid var(--border)" }}>
          <div style={{ width: 40, height: 50, borderRadius: 8, background: "linear-gradient(135deg, #D4C8F0, #7C5CBF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>⭐</div>
          <div>
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 14, fontWeight: 600, color: "var(--foreground)", margin: "0 0 2px" }}>Ege ve Kayıp Yıldız</p>
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>Yaklaşık 6 dk · Ege için</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }} className="screen-scroll">
        {/* Family voices section */}
        <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Aile Sesleri</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {voices.filter((v) => v.type === "personal").map((voice) => (
            <div
              key={voice.id}
              onClick={() => voice.status === "ready" && setSelected(voice.id)}
              style={{ padding: "14px 16px", borderRadius: 18, border: `2px solid ${selected === voice.id ? "var(--primary)" : "var(--border)"}`, background: selected === voice.id ? "var(--secondary)" : "white", cursor: voice.status === "ready" ? "pointer" : "default", display: "flex", alignItems: "center", gap: 12, transition: "all 0.2s ease", opacity: voice.status === "error" ? 0.9 : 1 }}
            >
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: voice.status === "ready" ? "linear-gradient(135deg, #F5C4A8, #F08B6E)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {voice.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{voice.label}</p>
                  {voice.status === "ready" && <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "#8DB89A", background: "rgba(141,184,154,0.15)", borderRadius: 6, padding: "2px 8px" }}>Hazır</span>}
                  {voice.status === "processing" && <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "#7BA7C9", background: "rgba(123,167,201,0.15)", borderRadius: 6, padding: "2px 8px" }}>Hazırlanıyor…</span>}
                  {voice.status === "error" && <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "#E05454", background: "rgba(224,84,84,0.1)", borderRadius: 6, padding: "2px 8px" }}>Hata</span>}
                </div>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
                  {voice.status === "processing" ? "Ses hazırlanıyor, biraz bekle…" : voice.status === "error" ? "Ses hazırlanırken bir sorun oluştu." : voice.name}
                </p>
                {voice.status === "error" && (
                  <button style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--primary)", cursor: "pointer", padding: 0, marginTop: 4 }}>Tekrar Dene</button>
                )}
              </div>
              {voice.status === "ready" && (
                <button
                  onClick={(e) => { e.stopPropagation(); handlePreview(voice.id) }}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: previewing === voice.id && previewState === "playing" ? "var(--primary)" : "var(--secondary)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 0.2s ease" }}
                >
                  {previewing === voice.id && previewState === "loading" ? (
                    <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite" }} />
                  ) : previewing === voice.id && previewState === "playing" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--primary)"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  )}
                </button>
              )}
              {voice.status === "processing" && (
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {[1, 2, 3].map((i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#7BA7C9", animation: `pulse-soft 1s ease infinite`, animationDelay: `${i * 0.2}s` }} />)}
                </div>
              )}
              {selected === voice.id && voice.status === "ready" && (
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
              )}
            </div>
          ))}

          {/* Add voice CTA — premium gated */}
          <button onClick={() => setShowPremiumSheet(true)} style={{ padding: "14px 16px", borderRadius: 18, background: "white", border: "2px dashed var(--border)", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", width: "100%", position: "relative" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎙</div>
            <div>
              <p style={{ fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--primary)", margin: "0 0 2px" }}>Sesimi Oluştur</p>
              <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>Kendi sesinle masalları anlat.</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        {/* System voices */}
        <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Masal Anlatıcıları</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {voices.filter((v) => v.type === "system").map((voice) => (
            <div key={voice.id} onClick={() => setSelected(voice.id)} style={{ padding: "14px 16px", borderRadius: 18, border: `2px solid ${selected === voice.id ? "var(--primary)" : "var(--border)"}`, background: selected === voice.id ? "var(--secondary)" : "white", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.2s ease" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg, #D4C8F0, #B09CE0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{voice.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{voice.label}</p>
                  {voice.desc && <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", background: "var(--muted)", borderRadius: 6, padding: "2px 8px" }}>{voice.desc}</span>}
                </div>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{voice.name}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handlePreview(voice.id) }} style={{ width: 36, height: 36, borderRadius: "50%", background: previewing === voice.id && previewState === "playing" ? "var(--primary)" : "var(--secondary)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                {previewing === voice.id && previewState === "loading" ? (
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--primary)", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite" }} />
                ) : previewing === voice.id && previewState === "playing" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--primary)"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                )}
              </button>
              {selected === voice.id && <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>}
            </div>
          ))}
        </div>
        <div style={{ height: 100 }} />
      </div>

      {/* CTA */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)" }}>
        <button
          onClick={handleGenerate}
          disabled={!canSelect}
          style={{ width: "100%", padding: "18px", borderRadius: 20, background: canSelect ? "linear-gradient(135deg, #9B7FD4, #7C5CBF)" : "var(--muted)", border: "none", color: canSelect ? "white" : "var(--muted-foreground)", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: canSelect ? "pointer" : "default", boxShadow: canSelect ? "0 8px 24px rgba(124,92,191,0.35)" : "none", transition: "all 0.2s ease" }}
        >
          {canSelect ? `${selectedVoice!.label} Sesiyle Seslendir` : "Bir ses seç"}
        </button>
      </div>

      {/* Premium Feature Blocked Sheet */}
      {showPremiumSheet && (
        <PremiumSheet
          featureName="Kendi Sesinle Anlatım"
          description="Masalları kendi sesinle anlatmak için Premium'a geçebilirsin."
          onUpgrade={() => { setShowPremiumSheet(false); if (onSubscription) onSubscription() }}
          onDismiss={() => setShowPremiumSheet(false)}
        />
      )}
    </div>
  )
}
