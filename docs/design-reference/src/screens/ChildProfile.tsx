import { useState } from "react"

type ChildView = "list" | "create" | "edit"

interface Props {
  onBack: () => void
  onDone?: () => void
  initialView?: ChildView
}

const interests = ["Dinozorlar", "Uzay", "Hayvanlar", "Arabalar", "Prensesler", "Deniz", "Doğa", "Robotlar", "Futbol", "Periler", "Macera", "Müzik"]
const avatarEmojis = ["🧒", "👧", "👦", "🐣", "⭐", "🌸", "🦋", "🐻"]

const mockChildren = [
  { id: "ege", name: "Ege", age: 6, emoji: "🧒", interests: ["Uzay", "Macera", "Dinozorlar"], stories: 8 },
  { id: "ada", name: "Ada", age: 4, emoji: "👧", interests: ["Prensesler", "Hayvanlar"], stories: 5 },
]

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button onClick={onPress} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  )
}

function FormScreen({
  title, frameLabel, onBack, onSave, onDelete, existingName, existingAge, existingInterests, existingEmoji,
}: {
  title: string; frameLabel: string; onBack: () => void; onSave: () => void; onDelete?: () => void;
  existingName?: string; existingAge?: number; existingInterests?: string[]; existingEmoji?: string;
}) {
  const [name, setName] = useState(existingName || "")
  const [age, setAge] = useState(existingAge || 3)
  const [selectedInterests, setSelectedInterests] = useState<string[]>(existingInterests || [])
  const [selectedEmoji, setSelectedEmoji] = useState(existingEmoji || "🧒")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [nameError, setNameError] = useState("")

  const toggleInterest = (i: string) => setSelectedInterests((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i])

  const handleSave = () => {
    if (!name.trim()) { setNameError("Çocuğunun adını gir."); return }
    setNameError(""); onSave()
  }

  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "52px 24px 16px", background: "linear-gradient(180deg, rgba(176,156,224,0.1) 0%, transparent 100%)", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BackButton onPress={onBack} />
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{frameLabel}</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>{title}</h1>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }} className="screen-scroll">
        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: "linear-gradient(135deg, #D4C8F0, #EDE8F8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, border: "3px solid white", boxShadow: "0 4px 16px rgba(124,92,191,0.2)" }}>
            {selectedEmoji}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {avatarEmojis.map((e) => (
              <button key={e} onClick={() => setSelectedEmoji(e)} style={{ width: 40, height: 40, borderRadius: "50%", background: selectedEmoji === e ? "var(--secondary)" : "white", border: `2px solid ${selectedEmoji === e ? "var(--primary)" : "var(--border)"}`, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
            Çocuğunun adı
          </label>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError("") }}
            placeholder="Örn. Ege"
            style={{ width: "100%", padding: "16px 18px", borderRadius: 16, border: `2px solid ${nameError ? "#E05454" : "var(--border)"}`, fontFamily: "Nunito", fontSize: 16, color: "var(--foreground)", background: "white", outline: "none", boxSizing: "border-box" }}
          />
          {nameError && <p style={{ fontFamily: "Nunito", fontSize: 12, color: "#E05454", margin: "6px 0 0", fontWeight: 500 }}>{nameError}</p>}
        </div>

        {/* Age */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>
            Yaşı
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button onClick={() => setAge(Math.max(0, age - 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: "white", border: "1px solid var(--border)", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 600, color: "var(--foreground)" }}>{age}</span>
              <span style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", marginLeft: 6, fontWeight: 500 }}>yaş</span>
            </div>
            <button onClick={() => setAge(Math.min(12, age + 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--secondary)", border: "none", fontSize: 20, cursor: "pointer", color: "var(--primary)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </div>
        </div>

        {/* Interests */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>
            Neleri seviyor?
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {interests.map((i) => (
              <button key={i} onClick={() => toggleInterest(i)} style={{ padding: "8px 16px", borderRadius: 12, border: `2px solid ${selectedInterests.includes(i) ? "var(--primary)" : "var(--border)"}`, background: selectedInterests.includes(i) ? "var(--secondary)" : "white", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: selectedInterests.includes(i) ? "var(--primary)" : "var(--foreground)", cursor: "pointer", transition: "all 0.15s ease" }}>
                {i}
              </button>
            ))}
            <button style={{ padding: "8px 16px", borderRadius: 12, border: "2px dashed var(--border)", background: "transparent", fontFamily: "Nunito", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)", cursor: "pointer" }}>
              + Kendim ekle
            </button>
          </div>
        </div>

        {/* Destructive */}
        {onDelete && (
          <button onClick={() => setShowDeleteConfirm(true)} style={{ width: "100%", padding: "14px", borderRadius: 16, background: "rgba(224,84,84,0.06)", border: "1px solid rgba(224,84,84,0.2)", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "#E05454", cursor: "pointer", marginBottom: 8 }}>
            Profili Sil
          </button>
        )}

        <div style={{ height: 100 }} />
      </div>

      <div style={{ padding: "12px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)", position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <button onClick={handleSave} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.35)" }}>
          Profili {existingName ? "Güncelle" : "Oluştur"}
        </button>
      </div>

      {/* Confirm Delete Sheet */}
      {showDeleteConfirm && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 50 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ width: "100%", background: "white", borderRadius: "24px 24px 0 0", padding: "24px 24px 48px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />
            <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: "0 0 10px", textAlign: "center" }}>
              Profili silmek istiyor musun?
            </h3>
            <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", margin: "0 0 24px", lineHeight: 1.6, fontWeight: 500 }}>
              Bu çocuk profili ve tüm hikâyeleri silinecek. Bu işlem geri alınamaz.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setShowDeleteConfirm(false); if (onDelete) onDelete() }} style={{ width: "100%", padding: "16px", borderRadius: 18, background: "#E05454", border: "none", color: "white", fontFamily: "Nunito", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                Profili Sil
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ width: "100%", padding: "16px", borderRadius: 18, background: "var(--muted)", border: "none", fontFamily: "Nunito", fontSize: 16, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChildProfile({ onBack, onDone, initialView = "list" }: Props) {
  const [view, setView] = useState<ChildView>(initialView)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (view === "create") return (
    <FormScreen title="Masalları kimin için hazırlıyoruz?" frameLabel="Child/01-CreateProfile" onBack={() => setView("list")} onSave={() => { setView("list"); if (onDone) onDone() }} />
  )

  if (view === "edit") {
    const child = mockChildren.find((c) => c.id === editingId)!
    return (
      <FormScreen title={`${child.name}'in Profili`} frameLabel="Child/02-EditProfile" onBack={() => setView("list")} onSave={() => setView("list")} onDelete={() => setView("list")} existingName={child.name} existingAge={child.age} existingInterests={child.interests} existingEmoji={child.emoji} />
    )
  }

  // List view
  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "52px 24px 20px", background: "linear-gradient(180deg, rgba(176,156,224,0.1) 0%, transparent 100%)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <BackButton onPress={onBack} />
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Child/03-Children</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Çocuklarım</h1>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 100px" }} className="screen-scroll">
        {mockChildren.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 32px", gap: 16, textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🧒</div>
            <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", lineHeight: 1.3 }}>Henüz bir çocuk profili yok.</h3>
            <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: "0 0 20px", lineHeight: 1.6, fontWeight: 500 }}>Masalları kişiselleştirmek için bir profil oluştur.</p>
            <button onClick={() => setView("create")} style={{ padding: "16px 28px", borderRadius: 18, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 20px rgba(124,92,191,0.3)" }}>
              Çocuk Ekle
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mockChildren.map((child) => (
            <div key={child.id} style={{ padding: "18px", background: "white", borderRadius: 20, border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #D4C8F0, #EDE8F8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>
                  {child.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>{child.name}</p>
                    <span style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>{child.age} yaş</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {child.interests.slice(0, 3).map((i) => (
                      <span key={i} style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: "var(--primary)", background: "var(--secondary)", borderRadius: 6, padding: "2px 8px" }}>{i}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => { setEditingId(child.id); setView("edit") }} style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--muted)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14 }}>📚</span>
                  <span style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>{child.stories} hikâye</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)" }}>
        <button onClick={() => setView("create")} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          + Çocuk Ekle
        </button>
      </div>
    </div>
  )
}
