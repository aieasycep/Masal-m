import { useState } from "react"

interface Props {
  onBack: () => void
  onSuccess: () => void
}

type OrderStep = "config" | "address" | "review" | "success"

export default function PrintOrder({ onBack, onSuccess }: Props) {
  const [step, setStep] = useState<OrderStep>("config")
  const [size, setSize] = useState("square")
  const [cover, setCover] = useState("hard")
  const [qty, setQty] = useState(1)
  const [address, setAddress] = useState({ name: "Ayşe Yılmaz", phone: "0532 123 45 67", street: "Bağcılar Mah. Gül Sok. No:12 D:3", city: "İstanbul", district: "Kadıköy", zip: "34710" })

  const price = (size === "square" ? 249 : 199) + (cover === "hard" ? 50 : 0)
  const total = price * qty + 29

  if (step === "success") {
    return (
      <div style={{ width: "100%", height: 844, background: "linear-gradient(160deg, #FAF8F4, #EDE8F8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", gap: 24, position: "relative", overflow: "hidden" }}>
        {/* Confetti */}
        {["#FFD97D", "#F08B6E", "#8DB89A", "#B09CE0", "#F5C4A8", "#7BA7C9"].map((c, i) => (
          <div key={i} style={{ position: "absolute", width: 12, height: 12, borderRadius: "50%", background: c, top: `${15 + i * 12}%`, left: `${10 + i * 15}%`, animation: `float ${2 + i * 0.4}s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
        ))}
        {["#9B7FD4", "#F08B6E", "#FFD97D"].map((c, i) => (
          <div key={i} style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: c, top: `${25 + i * 18}%`, right: `${10 + i * 12}%`, animation: `float ${2.5 + i * 0.3}s ease-in-out infinite`, animationDelay: `${i * 0.3 + 0.5}s` }} />
        ))}

        {/* Book mockup */}
        <div style={{ width: 140, height: 180, borderRadius: "8px 16px 16px 8px", background: "linear-gradient(160deg, #2D1B69, #7C5CBF)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "8px 8px 32px rgba(124,92,191,0.4)", fontSize: 60, border: "1px solid rgba(255,255,255,0.2)", position: "relative" }}>
          ⭐
          <div style={{ position: "absolute", left: 0, top: 0, width: 12, height: "100%", background: "#5A4190", borderRadius: "8px 0 0 8px" }} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            Ege'nin masalı yola çıkmaya hazırlanıyor 💛
          </h2>
          <p style={{ fontFamily: "Nunito", fontSize: 15, color: "var(--muted-foreground)", margin: "0 0 4px", lineHeight: 1.6, fontWeight: 500 }}>
            Siparişin alındı. 5–7 iş günü içinde kapında.
          </p>
          <p style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--primary)", margin: 0, fontWeight: 700 }}>
            Sipariş No: #MSL-2026-4821
          </p>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            style={{ width: "100%", padding: "16px", borderRadius: 18, background: "var(--secondary)", border: "none", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            📦 Siparişimi Takip Et
          </button>
          <button
            onClick={onSuccess}
            style={{ width: "100%", padding: "16px", borderRadius: 18, background: "white", border: "1px solid var(--border)", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "52px 24px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button
            onClick={step === "config" ? onBack : () => setStep(step === "review" ? "address" : step === "address" ? "config" : "config")}
            style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Fiziksel Kitap</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
              {step === "config" ? "Kitap Seçenekleri" : step === "address" ? "Teslimat Adresi" : "Sipariş Özeti"}
            </h1>
          </div>
        </div>
        {/* Steps */}
        <div style={{ display: "flex", gap: 4 }}>
          {["config", "address", "review"].map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: ["config", "address", "review"].indexOf(step) >= i ? "var(--primary)" : "var(--border)", transition: "background 0.3s ease" }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }} className="screen-scroll">
        {step === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeUp 0.4s ease both" }}>
            {/* Book preview */}
            <div style={{ display: "flex", gap: 16, padding: "20px", background: "white", borderRadius: 20, border: "1px solid var(--border)", alignItems: "center" }}>
              <div style={{ width: 64, height: 84, borderRadius: "4px 10px 10px 4px", background: "linear-gradient(135deg, #2D1B69, #7C5CBF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, boxShadow: "4px 4px 12px rgba(124,92,191,0.3)" }}>⭐</div>
              <div>
                <p style={{ fontFamily: "Fraunces, serif", fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: "0 0 2px" }}>Ege ve Kayıp Yıldız</p>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>Ege için özel · 5 sayfa + kapak</p>
              </div>
            </div>

            {/* Size */}
            <div>
              <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Kitap Boyutu</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[{ id: "square", label: "Kare", dim: "21 × 21 cm", extra: "+₺50" }, { id: "standard", label: "Standart", dim: "21 × 29.7 cm", extra: "" }].map((s) => (
                  <div key={s.id} onClick={() => setSize(s.id)} style={{ padding: "16px", borderRadius: 16, border: `2px solid ${size === s.id ? "var(--primary)" : "var(--border)"}`, background: size === s.id ? "var(--secondary)" : "white", cursor: "pointer", textAlign: "center", transition: "all 0.15s ease" }}>
                    <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: size === s.id ? "var(--primary)" : "var(--foreground)", margin: "0 0 2px" }}>{s.label}</p>
                    <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{s.dim}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cover */}
            <div>
              <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Kapak Türü</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[{ id: "hard", label: "Sert Kapak", sub: "Daha dayanıklı", emoji: "📗" }, { id: "soft", label: "Yumuşak Kapak", sub: "Hafif ve esnek", emoji: "📔" }].map((c) => (
                  <div key={c.id} onClick={() => setCover(c.id)} style={{ padding: "16px", borderRadius: 16, border: `2px solid ${cover === c.id ? "var(--primary)" : "var(--border)"}`, background: cover === c.id ? "var(--secondary)" : "white", cursor: "pointer", textAlign: "center", transition: "all 0.15s ease" }}>
                    <span style={{ fontSize: 28 }}>{c.emoji}</span>
                    <p style={{ fontFamily: "Nunito", fontSize: 13, fontWeight: 700, color: cover === c.id ? "var(--primary)" : "var(--foreground)", margin: "6px 0 2px" }}>{c.label}</p>
                    <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>{c.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Qty */}
            <div>
              <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Adet</p>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: "white", border: "1px solid var(--border)", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 600, color: "var(--foreground)", minWidth: 40, textAlign: "center" }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--secondary)", border: "none", fontSize: 20, cursor: "pointer", color: "var(--primary)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>

            {/* Price summary */}
            <div style={{ padding: "16px", borderRadius: 16, background: "white", border: "1px solid var(--border)" }}>
              {[{ label: `${qty} × Kitap (${size === "square" ? "Kare" : "Standart"} · ${cover === "hard" ? "Sert" : "Yumuşak"} Kapak)`, value: `₺${price * qty}` }, { label: "Kargo", value: "₺29" }].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500 }}>{row.label}</span>
                  <span style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--foreground)", fontWeight: 700 }}>{row.value}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Toplam</span>
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600, color: "var(--primary)" }}>₺{total}</span>
              </div>
            </div>
          </div>
        )}

        {step === "address" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp 0.4s ease both" }}>
            {Object.entries({ name: "Ad Soyad", phone: "Telefon", street: "Adres", city: "İl", district: "İlçe", zip: "Posta Kodu" }).map(([key, label]) => (
              <div key={key}>
                <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
                <input
                  value={address[key as keyof typeof address]}
                  onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "2px solid var(--border)", fontFamily: "Nunito", fontSize: 15, color: "var(--foreground)", background: "white", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            ))}
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: 0, fontWeight: 500 }}>
              🚚 Tahmini teslimat: 5–7 iş günü
            </p>
          </div>
        )}

        {step === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp 0.4s ease both" }}>
            {[
              { title: "Ürün", lines: [`Kare · Sert Kapak · ${qty} adet`] },
              { title: "Teslimat Adresi", lines: [address.name, address.street, `${address.district}, ${address.city} ${address.zip}`, address.phone] },
              { title: "Ödeme Özeti", lines: [`Kitap: ₺${price * qty}`, "Kargo: ₺29", `Toplam: ₺${total}`] },
            ].map((section) => (
              <div key={section.title} style={{ padding: "16px 18px", borderRadius: 16, background: "white", border: "1px solid var(--border)" }}>
                <p style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{section.title}</p>
                {section.lines.map((l, i) => (
                  <p key={i} style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--foreground)", margin: i === section.lines.length - 1 ? 0 : "0 0 2px", fontWeight: l.includes("Toplam") ? 700 : 500 }}>{l}</p>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>

      {/* CTA */}
      <div style={{ padding: "12px 24px 40px", background: "var(--background)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <button
          onClick={() => {
            if (step === "config") setStep("address")
            else if (step === "address") setStep("review")
            else setStep("success")
          }}
          style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.35)" }}
        >
          {step === "review" ? `Ödemeyi Tamamla · ₺${total}` : "Devam Et"}
        </button>
      </div>
    </div>
  )
}
