import { useState } from "react"

interface Props {
  onBack: () => void
  onContinue: () => void
}

type Field = "name" | "phone" | "city" | "district" | "neighborhood" | "street" | "buildingInfo" | "zip"

const fieldDefs: { key: Field; label: string; placeholder: string; required: boolean }[] = [
  { key: "name", label: "Ad Soyad", placeholder: "Ayşe Yılmaz", required: true },
  { key: "phone", label: "Telefon", placeholder: "0532 123 45 67", required: true },
  { key: "city", label: "İl", placeholder: "İstanbul", required: true },
  { key: "district", label: "İlçe", placeholder: "Kadıköy", required: true },
  { key: "neighborhood", label: "Mahalle", placeholder: "Bağcılar Mahallesi", required: true },
  { key: "street", label: "Cadde / Sokak", placeholder: "Gül Sokak No:12", required: true },
  { key: "buildingInfo", label: "Bina / Daire", placeholder: "Kat 3, Daire 7", required: false },
  { key: "zip", label: "Posta Kodu", placeholder: "34710", required: false },
]

export default function CheckoutAddress({ onBack, onContinue }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({
    name: "", phone: "", city: "", district: "", neighborhood: "",
    street: "", buildingInfo: "", zip: "",
  })
  const [focused, setFocused] = useState<Field | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [saveAddress, setSaveAddress] = useState(true)

  const set = (key: Field, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  const validate = () => {
    const newErrors: Partial<Record<Field, string>> = {}
    fieldDefs.forEach((f) => {
      if (f.required && !values[f.key].trim()) {
        newErrors[f.key] = "Bu alan zorunludur."
      }
    })
    if (values.phone && !/^[0-9\s+()-]{10,}$/.test(values.phone)) {
      newErrors.phone = "Geçerli bir telefon numarası girin."
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = () => {
    if (validate()) onContinue()
  }

  return (
    <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Checkout/02-Address</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Teslimat Adresi</h1>
        </div>
      </div>

      {/* Progress bar: step 2/4 */}
      <div style={{ padding: "0 24px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["Kitap", "Adres", "Özet", "Ödeme"].map((label, i) => (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div style={{ width: "100%", height: 4, borderRadius: 2, background: i <= 1 ? "var(--primary)" : "var(--border)" }} />
              <span style={{ fontFamily: "Nunito", fontSize: 9, fontWeight: i === 1 ? 800 : 600, color: i <= 1 ? "var(--primary)" : "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 120px" }} className="screen-scroll">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {fieldDefs.map((field) => {
            const hasError = !!errors[field.key]
            const isFocused = focused === field.key
            return (
              <div key={field.key}>
                <label style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: hasError ? "#E05454" : "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                  {field.label}{field.required && <span style={{ color: "var(--accent)" }}> *</span>}
                </label>
                <input
                  value={values[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  onFocus={() => setFocused(field.key)}
                  onBlur={() => setFocused(null)}
                  style={{ width: "100%", padding: "16px 18px", borderRadius: 16, border: `2px solid ${hasError ? "#E05454" : isFocused ? "var(--primary)" : "var(--border)"}`, fontFamily: "Nunito", fontSize: 15, color: "var(--foreground)", background: "white", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s ease", fontWeight: 500 }}
                />
                {hasError && (
                  <p style={{ fontFamily: "Nunito", fontSize: 12, color: "#E05454", margin: "4px 0 0", fontWeight: 600 }}>⚠ {errors[field.key]}</p>
                )}
              </div>
            )
          })}

          {/* Save address checkbox */}
          <div onClick={() => setSaveAddress((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: "white", border: "1px solid var(--border)", cursor: "pointer", marginTop: 4 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${saveAddress ? "var(--primary)" : "var(--border)"}`, background: saveAddress ? "var(--primary)" : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s ease" }}>
              {saveAddress && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
            <span style={{ fontFamily: "Nunito", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>Bu adresi daha sonra kullanmak için kaydet</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, padding: "12px 24px 40px", background: "linear-gradient(0deg, var(--background) 70%, transparent)" }}>
        <button onClick={handleContinue} style={{ width: "100%", padding: "18px", borderRadius: 20, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(124,92,191,0.3)" }}>
          Devam Et →
        </button>
      </div>
    </div>
  )
}
