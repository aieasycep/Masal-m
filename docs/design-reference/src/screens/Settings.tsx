import { useState } from "react"

type SettingsView = "main" | "account" | "language" | "notifications" | "voicedata" | "deleteaccount"

interface Props {
  onBack: () => void
  onVoiceStudio?: () => void
  onChildProfile?: () => void
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button onClick={onPress} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  )
}

function ListRow({ icon, label, sub, badge, destructive, toggle, toggleValue, onToggle, onClick, disabled }: {
  icon?: string; label: string; sub?: string; badge?: string; destructive?: boolean; toggle?: boolean;
  toggleValue?: boolean; onToggle?: () => void; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <div onClick={!toggle && !disabled ? onClick : undefined} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: !toggle && !disabled ? "pointer" : "default", opacity: disabled ? 0.5 : 1 }}>
      {icon && (
        <div style={{ width: 38, height: 38, borderRadius: 11, background: destructive ? "rgba(224,84,84,0.08)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 600, color: destructive ? "#E05454" : "var(--foreground)", margin: "0" }}>{label}</p>
        {sub && <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "1px 0 0", fontWeight: 500 }}>{sub}</p>}
      </div>
      {badge && <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "var(--primary)", background: "var(--secondary)", borderRadius: 8, padding: "3px 10px" }}>{badge}</span>}
      {toggle ? (
        <div onClick={onToggle} style={{ width: 48, height: 28, borderRadius: 14, background: toggleValue ? "var(--primary)" : "var(--border)", position: "relative", cursor: "pointer", transition: "background 0.2s ease", flexShrink: 0 }}>
          <div style={{ position: "absolute", width: 22, height: 22, borderRadius: "50%", background: "white", top: 3, left: toggleValue ? 23 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }} />
        </div>
      ) : (
        !destructive && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      )}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 8px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</p>
      <div style={{ background: "white", borderRadius: 18, border: "1px solid var(--border)", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  )
}

export default function Settings({ onBack, onVoiceStudio, onChildProfile }: Props) {
  const [view, setView] = useState<SettingsView>("main")

  // Account state
  const [name, setName] = useState("Ayşe Yılmaz")
  const [email] = useState("ayse@email.com")
  const [nameSaved, setNameSaved] = useState(false)

  // Notifications
  const [notifs, setNotifs] = useState({ story: true, voice: true, illustration: false, order: true, updates: false })
  const toggleNotif = (k: keyof typeof notifs) => setNotifs((p) => ({ ...p, [k]: !p[k] }))

  // Delete account confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Voice data delete confirm
  const [deletingVoice, setDeletingVoice] = useState<string | null>(null)

  const handleSaveName = () => { setNameSaved(true); setTimeout(() => setNameSaved(false), 2000) }

  // ─── MAIN ─────────────────────────────────────────────────────
  if (view === "main") return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)", paddingBottom: 40 }} className="screen-scroll">
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <BackButton onPress={onBack} />
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Settings/01-Main</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Ayarlar</h1>
        </div>
      </div>
      <div style={{ padding: "0 24px" }}>
        <SectionCard title="Hesap">
          <ListRow icon="👤" label="Hesap Bilgileri" sub="Ayşe Yılmaz" onClick={() => setView("account")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🧒" label="Çocuklarım" sub="2 çocuk profili" onClick={onChildProfile ?? onBack} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🎙" label="Seslerim" sub="2 ses kaydedildi" onClick={() => { if (onVoiceStudio) onVoiceStudio() }} />
        </SectionCard>
        <SectionCard title="Tercihler">
          <ListRow icon="🔔" label="Bildirimler" onClick={() => setView("notifications")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🌍" label="Dil" sub="Türkçe" onClick={() => setView("language")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🔊" label="Ses ve Oynatma" sub="Varsayılan hız: 1x" onClick={() => {}} />
        </SectionCard>
        <SectionCard title="Gizlilik">
          <ListRow icon="🔒" label="Ses Verilerim" onClick={() => setView("voicedata")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="📄" label="Gizlilik Politikası" onClick={() => {}} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="📋" label="Kullanım Koşulları" onClick={() => {}} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🤖" label="AI İçerik Bilgilendirmesi" onClick={() => {}} />
        </SectionCard>
        <SectionCard title="Hesap">
          <ListRow icon="🚪" label="Çıkış Yap" onClick={() => {}} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🗑" label="Hesabımı Sil" destructive onClick={() => setView("deleteaccount")} />
        </SectionCard>
        <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", margin: "8px 0 0", fontWeight: 500 }}>Masalım v1.0.0</p>
      </div>
    </div>
  )

  // ─── ACCOUNT ──────────────────────────────────────────────────
  if (view === "account") return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)", paddingBottom: 100 }} className="screen-scroll">
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <BackButton onPress={() => setView("main")} />
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Settings/02-Account</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Hesap Bilgileri</h1>
        </div>
      </div>
      <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #D4C8F0, #7C5CBF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, border: "3px solid white", boxShadow: "0 4px 16px rgba(124,92,191,0.2)" }}>👩</div>
          <button style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--primary)", cursor: "pointer" }}>Fotoğraf Değiştir</button>
        </div>
        {[{ label: "Ad Soyad", value: name, onChange: setName, editable: true }, { label: "E-posta", value: email, editable: false }].map((field) => (
          <div key={field.label}>
            <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>{field.label}</label>
            <input value={field.value} onChange={field.onChange ? (e) => field.onChange!(e.target.value) : undefined} readOnly={!field.editable} style={{ width: "100%", padding: "16px 18px", borderRadius: 16, border: "2px solid var(--border)", fontFamily: "Nunito", fontSize: 15, color: field.editable ? "var(--foreground)" : "var(--muted-foreground)", background: field.editable ? "white" : "var(--muted)", outline: "none", boxSizing: "border-box" }} />
          </div>
        ))}
      </div>
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "12px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)" }}>
        <button onClick={handleSaveName} style={{ width: "100%", padding: "18px", borderRadius: 20, background: nameSaved ? "rgba(141,184,154,0.15)" : "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: nameSaved ? "#8DB89A" : "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: nameSaved ? "none" : "0 8px 24px rgba(124,92,191,0.35)", transition: "all 0.3s ease" }}>
          {nameSaved ? "✓ Kaydedildi" : "Değişiklikleri Kaydet"}
        </button>
      </div>
    </div>
  )

  // ─── LANGUAGE ─────────────────────────────────────────────────
  if (view === "language") return (
    <div style={{ width: "100%", height: 844, background: "var(--background)" }}>
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <BackButton onPress={() => setView("main")} />
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Settings/03-Language</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Dil</h1>
        </div>
      </div>
      <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[{ code: "tr", label: "Türkçe", active: true }, { code: "en", label: "English", active: false, badge: "Yakında" }].map((lang) => (
          <div key={lang.code} style={{ padding: "16px 18px", borderRadius: 18, background: "white", border: `2px solid ${lang.active ? "var(--primary)" : "var(--border)"}`, display: "flex", alignItems: "center", gap: 14, cursor: lang.active ? "pointer" : "default", opacity: lang.badge ? 0.6 : 1 }}>
            <span style={{ fontSize: 28 }}>{lang.code === "tr" ? "🇹🇷" : "🇬🇧"}</span>
            <span style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: lang.active ? "var(--primary)" : "var(--foreground)", flex: 1 }}>{lang.label}</span>
            {lang.badge && <span style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", background: "var(--muted)", borderRadius: 8, padding: "3px 10px" }}>{lang.badge}</span>}
            {lang.active && <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>}
          </div>
        ))}
      </div>
    </div>
  )

  // ─── NOTIFICATIONS ────────────────────────────────────────────
  if (view === "notifications") return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)" }} className="screen-scroll">
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <BackButton onPress={() => setView("main")} />
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Settings/04-Notifications</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Bildirimler</h1>
        </div>
      </div>
      <div style={{ padding: "0 24px" }}>
        <SectionCard title="Masalım Bildirimleri">
          <ListRow icon="📖" label="Hikâyem hazır olduğunda" sub="AI oluşturma tamamlandığında" toggle toggleValue={notifs.story} onToggle={() => toggleNotif("story")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🎙" label="Sesim hazır olduğunda" sub="Ses klonlama tamamlandığında" toggle toggleValue={notifs.voice} onToggle={() => toggleNotif("voice")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="🎨" label="Kitap görselleri hazır" sub="İllüstrasyon oluşturma" toggle toggleValue={notifs.illustration} onToggle={() => toggleNotif("illustration")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="📦" label="Sipariş güncellemeleri" sub="Kargo ve teslimat" toggle toggleValue={notifs.order} onToggle={() => toggleNotif("order")} />
          <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
          <ListRow icon="✨" label="Yeni özellikler ve öneriler" sub="Uygulama güncellemeleri" toggle toggleValue={notifs.updates} onToggle={() => toggleNotif("updates")} />
        </SectionCard>
      </div>
    </div>
  )

  // ─── VOICE DATA ───────────────────────────────────────────────
  if (view === "voicedata") return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)" }} className="screen-scroll">
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <BackButton onPress={() => setView("main")} />
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Settings/05-VoiceData</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Ses Verilerim</h1>
        </div>
      </div>
      <div style={{ padding: "0 24px" }}>
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(124,92,191,0.08)", border: "1px solid rgba(124,92,191,0.15)", marginBottom: 20 }}>
          <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>🔒 Ses kayıtların yalnızca izin verdiğin içerikleri oluşturmak için kullanılır. İstediğin zaman silebilirsin.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[{ label: "Anne", name: "Annemin Sesi", date: "12 Temmuz 2026", emoji: "👩" }, { label: "Baba", name: "Babamın Sesi", date: "5 Temmuz 2026", emoji: "👨" }].map((voice) => (
            <div key={voice.label} style={{ padding: "16px 18px", background: "white", borderRadius: 18, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #F5C4A8, #F08B6E)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{voice.emoji}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 2px" }}>{voice.label}</p>
                  <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{voice.name} · {voice.date}</p>
                </div>
                <button style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--secondary)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, padding: "10px", borderRadius: 12, background: "var(--muted)", border: "none", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}>Yeniden Kaydet</button>
                <button onClick={() => setDeletingVoice(voice.label)} style={{ flex: 1, padding: "10px", borderRadius: 12, background: "rgba(224,84,84,0.08)", border: "1px solid rgba(224,84,84,0.2)", fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: "#E05454", cursor: "pointer" }}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm delete sheet */}
      {deletingVoice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 50 }} onClick={() => setDeletingVoice(null)}>
          <div style={{ width: 390, background: "white", borderRadius: "24px 24px 0 0", padding: "24px 24px 48px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />
            <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: "var(--foreground)", margin: "0 0 10px", textAlign: "center" }}>
              {deletingVoice} sesini sil?
            </h3>
            <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", margin: "0 0 24px", lineHeight: 1.6, fontWeight: 500 }}>
              Bu ses profilini sildiğinde yeni hikâyelerde kullanılamaz. Mevcut seslendirilmiş hikâyeler etkilenmez.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => setDeletingVoice(null)} style={{ width: "100%", padding: "16px", borderRadius: 18, background: "#E05454", border: "none", color: "white", fontFamily: "Nunito", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Sesimi Sil</button>
              <button onClick={() => setDeletingVoice(null)} style={{ width: "100%", padding: "16px", borderRadius: 18, background: "var(--muted)", border: "none", fontFamily: "Nunito", fontSize: 16, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ─── DELETE ACCOUNT ───────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <BackButton onPress={() => setView("main")} />
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Settings/06-DeleteAccount</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Hesabımı Sil</h1>
        </div>
      </div>
      <div style={{ flex: 1, padding: "0 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ padding: "20px", borderRadius: 18, background: "rgba(224,84,84,0.06)", border: "1px solid rgba(224,84,84,0.2)" }}>
          <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "#E05454", margin: "0 0 12px" }}>Hesabını silmek istediğine emin misin?</p>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--foreground)", margin: "0 0 12px", lineHeight: 1.6, fontWeight: 500 }}>Bu işlem geri alınamaz. Silinecekler:</p>
          {["Tüm hikâyeler ve seslendirmeler", "Çocuk profilleri", "Kayıtlı anne ve baba sesleri", "Kitap verileri ve siparişler"].map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E05454", flexShrink: 0 }} />
              <span style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--foreground)", fontWeight: 500 }}>{item}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => setDeleteConfirm(true)} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "#E05454", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer" }}>Hesabımı Sil</button>
          <button onClick={() => setView("main")} style={{ width: "100%", padding: "16px", borderRadius: 20, background: "white", border: "1px solid var(--border)", fontFamily: "Nunito", fontSize: 16, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}>Vazgeç</button>
        </div>
      </div>
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 50 }} onClick={() => setDeleteConfirm(false)}>
          <div style={{ width: 390, background: "white", borderRadius: "24px 24px 0 0", padding: "24px 24px 48px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />
            <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", margin: "0 0 20px", lineHeight: 1.6, fontWeight: 500 }}>Son kez onaylıyorsun. Bu işlem geri alınamaz.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(false)} style={{ width: "100%", padding: "16px", borderRadius: 18, background: "#E05454", border: "none", color: "white", fontFamily: "Nunito", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Evet, Hesabımı Sil</button>
              <button onClick={() => setDeleteConfirm(false)} style={{ width: "100%", padding: "16px", borderRadius: 18, background: "var(--muted)", border: "none", fontFamily: "Nunito", fontSize: 16, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
