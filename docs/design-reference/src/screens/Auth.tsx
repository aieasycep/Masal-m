import { useState } from "react"

type AuthView = "welcome" | "login" | "register" | "forgot" | "resetSent"

interface Props {
  onDone: () => void
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )
}

type InputState = "default" | "focused" | "error" | "success"

function FormInput({
  label, placeholder, type = "text", value, onChange, error, hint,
}: {
  label: string; placeholder: string; type?: string; value: string;
  onChange: (v: string) => void; error?: string; hint?: string;
}) {
  const [focused, setFocused] = useState(false)
  const state: InputState = error ? "error" : focused ? "focused" : "default"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          padding: "16px 18px",
          borderRadius: 16,
          border: `2px solid ${state === "error" ? "#E05454" : state === "focused" ? "var(--primary)" : "var(--border)"}`,
          fontFamily: "Nunito",
          fontSize: 15,
          color: "var(--foreground)",
          background: "white",
          outline: "none",
          transition: "border-color 0.2s ease",
          boxSizing: "border-box",
          width: "100%",
        }}
      />
      {error && (
        <p style={{ fontFamily: "Nunito", fontSize: 12, color: "#E05454", margin: 0, fontWeight: 500 }}>{error}</p>
      )}
      {hint && !error && (
        <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{hint}</p>
      )}
    </div>
  )
}

function SocialButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", padding: "16px", borderRadius: 18, background: "white", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", transition: "border-color 0.2s ease" }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  )
}

function PrimaryButton({ label, onClick, loading }: { label: string; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{ width: "100%", padding: "18px", borderRadius: 20, background: loading ? "var(--secondary)" : "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: loading ? "var(--primary)" : "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: loading ? "default" : "pointer", boxShadow: loading ? "none" : "0 8px 24px rgba(124,92,191,0.35)", transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
    >
      {loading && <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(124,92,191,0.3)", borderTopColor: "var(--primary)", animation: "spin-slow 0.8s linear infinite" }} />}
      {label}
    </button>
  )
}

export default function Auth({ onDone }: Props) {
  const [view, setView] = useState<AuthView>("welcome")

  // Login state
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPass, setLoginPass] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPass, setRegPass] = useState("")
  const [regError, setRegError] = useState("")
  const [regLoading, setRegLoading] = useState(false)

  // Forgot
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleLogin = () => {
    if (!loginEmail.includes("@")) { setLoginError("Geçerli bir e-posta adresi gir."); return }
    setLoginLoading(true)
    setLoginError("")
    setTimeout(() => { setLoginLoading(false); onDone() }, 1500)
  }

  const handleRegister = () => {
    if (!regName) { setRegError("İsim alanı boş bırakılamaz."); return }
    if (!regEmail.includes("@")) { setRegError("Geçerli bir e-posta adresi gir."); return }
    if (regPass.length < 6) { setRegError("Şifre en az 6 karakter olmalı."); return }
    setRegLoading(true); setRegError("")
    setTimeout(() => { setRegLoading(false); onDone() }, 1500)
  }

  const handleForgot = () => {
    setForgotLoading(true)
    setTimeout(() => { setForgotLoading(false); setView("resetSent") }, 1200)
  }

  // ─── Auth Welcome ──────────────────────────────────────────────
  if (view === "welcome") return (
    <div style={{ width: "100%", minHeight: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top gradient art */}
      <div style={{ height: 280, background: "linear-gradient(160deg, #2D1B69 0%, #7C5CBF 60%, #B09CE0 100%)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", width: 2, height: 2, borderRadius: "50%", background: "white", opacity: 0.25 + (i % 4) * 0.1, top: `${(i * 53 + 7) % 100}%`, left: `${(i * 71 + 11) % 100}%` }} />
        ))}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 88, height: 88, borderRadius: 26, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, animation: "float 3s ease-in-out infinite", backdropFilter: "blur(8px)" }}>
            📖
          </div>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 40, fontWeight: 600, color: "white", margin: 0, letterSpacing: "-0.02em" }}>Masalım</h1>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "32px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: "var(--foreground)", margin: "0 0 10px", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
            Masallarına kaldığın<br />yerden devam et.
          </h2>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
            Hikâyelerini, seslerini ve çocuk profillerini güvenle saklamak için hesabını oluştur.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SocialButton icon="🍎" label="Apple ile Devam Et" onClick={onDone} />
          <SocialButton icon="🔵" label="Google ile Devam Et" onClick={onDone} />
          <button
            onClick={() => setView("register")}
            style={{ width: "100%", padding: "16px", borderRadius: 18, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.35)" }}
          >
            E-posta ile Devam Et
          </button>
        </div>

        <div style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", fontWeight: 500 }}>Zaten hesabın var mı? </span>
          <button onClick={() => setView("login")} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--primary)", cursor: "pointer", padding: 0 }}>Giriş Yap</button>
        </div>

        <button onClick={onDone} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500, cursor: "pointer", padding: 0, textAlign: "center" }}>
          Şimdilik atla
        </button>

        <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
          Devam ederek{" "}
          <span style={{ color: "var(--primary)", fontWeight: 700, cursor: "pointer" }}>Kullanım Koşulları</span>
          {"'nı ve "}
          <span style={{ color: "var(--primary)", fontWeight: 700, cursor: "pointer" }}>Gizlilik Politikası</span>
          {"'nı kabul etmiş olursun."}
        </p>
      </div>
    </div>
  )

  // ─── E-posta ile Giriş ─────────────────────────────────────────
  if (view === "login") return (
    <div style={{ width: "100%", minHeight: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "52px 24px 28px", background: "linear-gradient(180deg, rgba(176,156,224,0.1) 0%, transparent 100%)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <BackButton onPress={() => setView("welcome")} />
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Auth/02-EmailLogin</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Giriş Yap</h1>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 40px" }} className="screen-scroll">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          <FormInput label="E-posta" placeholder="ornek@email.com" type="email" value={loginEmail} onChange={setLoginEmail} error={loginError && loginError.includes("e-posta") ? loginError : ""} />
          <FormInput label="Şifre" placeholder="En az 6 karakter" type="password" value={loginPass} onChange={setLoginPass} />
        </div>

        {loginError && !loginError.includes("e-posta") && (
          <div style={{ padding: "12px 16px", borderRadius: 14, background: "rgba(224,84,84,0.08)", border: "1px solid rgba(224,84,84,0.2)", marginBottom: 20 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 13, color: "#E05454", margin: 0, fontWeight: 600 }}>⚠ {loginError}</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PrimaryButton label={loginLoading ? "Giriş yapılıyor…" : "Giriş Yap"} onClick={handleLogin} loading={loginLoading} />
          <button onClick={() => setView("forgot")} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 600, color: "var(--primary)", cursor: "pointer", textAlign: "center" }}>
            Şifremi Unuttum
          </button>
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "24px 0" }} />
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", fontWeight: 500 }}>
          Hesabın yok mu?{" "}
          <button onClick={() => setView("register")} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--primary)", cursor: "pointer", padding: 0 }}>Kayıt Ol</button>
        </p>
      </div>
    </div>
  )

  // ─── Kayıt ─────────────────────────────────────────────────────
  if (view === "register") return (
    <div style={{ width: "100%", minHeight: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "52px 24px 20px", background: "linear-gradient(180deg, rgba(176,156,224,0.1) 0%, transparent 100%)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <BackButton onPress={() => setView("welcome")} />
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Auth/03-Register</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Hesap Oluştur</h1>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 40px" }} className="screen-scroll">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          <FormInput label="Adın" placeholder="Örn. Ayşe" value={regName} onChange={setRegName} error={regError && regError.includes("İsim") ? regError : ""} />
          <FormInput label="E-posta" placeholder="ornek@email.com" type="email" value={regEmail} onChange={setRegEmail} error={regError && regError.includes("e-posta") ? regError : ""} />
          <FormInput label="Şifre" placeholder="En az 6 karakter" type="password" value={regPass} onChange={setRegPass} error={regError && regError.includes("Şifre") ? regError : ""} hint="Güçlü bir şifre seç." />
        </div>

        {regError && !["İsim", "e-posta", "Şifre"].some((k) => regError.includes(k)) && (
          <div style={{ padding: "12px 16px", borderRadius: 14, background: "rgba(224,84,84,0.08)", border: "1px solid rgba(224,84,84,0.2)", marginBottom: 20 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 13, color: "#E05454", margin: 0, fontWeight: 600 }}>⚠ {regError}</p>
          </div>
        )}

        <PrimaryButton label={regLoading ? "Hesap oluşturuluyor…" : "Hesap Oluştur"} onClick={handleRegister} loading={regLoading} />

        <div style={{ height: 1, background: "var(--border)", margin: "24px 0" }} />
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", fontWeight: 500 }}>
          Zaten hesabın var mı?{" "}
          <button onClick={() => setView("login")} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, color: "var(--primary)", cursor: "pointer", padding: 0 }}>Giriş Yap</button>
        </p>
      </div>
    </div>
  )

  // ─── Şifremi Unuttum ───────────────────────────────────────────
  if (view === "forgot") return (
    <div style={{ width: "100%", minHeight: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "52px 24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <BackButton onPress={() => setView("login")} />
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Auth/04-ForgotPassword</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Şifremi Unuttum</h1>
          </div>
        </div>
        <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 28px", lineHeight: 1.6, fontWeight: 500 }}>
          E-posta adresine bir şifre sıfırlama bağlantısı göndereceğiz.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <FormInput label="E-posta" placeholder="ornek@email.com" type="email" value={forgotEmail} onChange={setForgotEmail} />
          <PrimaryButton label={forgotLoading ? "Gönderiliyor…" : "Sıfırlama Bağlantısı Gönder"} onClick={handleForgot} loading={forgotLoading} />
        </div>
      </div>
    </div>
  )

  // ─── Reset Email Sent ──────────────────────────────────────────
  return (
    <div style={{ width: "100%", minHeight: 844, background: "var(--background)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", gap: 24 }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(141,184,154,0.15)", border: "2px solid rgba(141,184,154,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>
        ✉️
      </div>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600, color: "var(--foreground)", margin: "0 0 10px", letterSpacing: "-0.01em" }}>
          E-postanı kontrol et.
        </h2>
        <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
          {forgotEmail || "E-posta adresine"} sıfırlama bağlantısı gönderdik. Birkaç dakika içinde gelmezse spam klasörüne bakabilirsin.
        </p>
      </div>
      <button onClick={() => setView("login")} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.35)" }}>
        Giriş Sayfasına Dön
      </button>
      <button onClick={() => { setForgotEmail(""); setView("forgot") }} style={{ background: "none", border: "none", fontFamily: "Nunito", fontSize: 14, fontWeight: 600, color: "var(--primary)", cursor: "pointer" }}>
        Tekrar Gönder
      </button>
    </div>
  )
}
