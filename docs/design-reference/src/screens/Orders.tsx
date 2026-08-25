import { useState } from "react"

interface Props {
  onBack: () => void
}

type OrderStatus = "preparing" | "printing" | "shipped" | "delivered"

const orders = [
  { id: "MSL-20482", title: "Ege ve Kayıp Yıldız", emoji: "⭐", date: "20 Ağustos 2026", status: "shipped" as OrderStatus, cover: "linear-gradient(135deg, #2D1B69, #7C5CBF)" },
  { id: "MSL-19234", title: "Ormanın En Küçük Kaşifi", emoji: "🌿", date: "1 Ağustos 2026", status: "delivered" as OrderStatus, cover: "linear-gradient(135deg, #0F2A1A, #1A5235)" },
]

const statusLabels: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  preparing: { label: "Hazırlanıyor", color: "#7BA7C9", bg: "rgba(123,167,201,0.12)" },
  printing: { label: "Basılıyor", color: "#B09CE0", bg: "rgba(176,156,224,0.12)" },
  shipped: { label: "Kargoya Verildi", color: "#F08B6E", bg: "rgba(240,139,110,0.12)" },
  delivered: { label: "Teslim Edildi", color: "#8DB89A", bg: "rgba(141,184,154,0.12)" },
}

const trackingSteps = [
  { label: "Sipariş Alındı", done: true },
  { label: "Baskıya Hazırlanıyor", done: true },
  { label: "Basıldı", done: true },
  { label: "Kargoya Verildi", done: true, active: true },
  { label: "Teslim Edildi", done: false },
]

export default function Orders({ onBack }: Props) {
  const [view, setView] = useState<"list" | "tracking">("list")
  const [selectedOrder, setSelectedOrder] = useState(orders[0])

  if (view === "tracking") {
    const st = statusLabels[selectedOrder.status]
    return (
      <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)", paddingBottom: 40 }} className="screen-scroll">
        <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setView("list")} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Orders/02-Tracking</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Sipariş Takibi</h1>
          </div>
        </div>

        {/* Book card */}
        <div style={{ margin: "0 24px 24px", padding: "16px", background: "white", borderRadius: 20, border: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 56, height: 72, borderRadius: 8, background: selectedOrder.cover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, boxShadow: "4px 4px 12px rgba(0,0,0,0.15)" }}>
            {selectedOrder.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px" }}>{selectedOrder.title}</p>
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "0 0 6px", fontWeight: 500 }}>Sipariş #{selectedOrder.id}</p>
            <span style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 8, padding: "3px 10px" }}>{st.label}</span>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ margin: "0 24px 24px", padding: "20px", background: "white", borderRadius: 20, border: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sipariş Durumu</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {trackingSteps.map((step, i) => (
              <div key={step.label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: step.done ? (step.active ? "var(--primary)" : "rgba(141,184,154,0.2)") : "var(--muted)", border: `2px solid ${step.done ? (step.active ? "var(--primary)" : "rgba(141,184,154,0.5)") : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                    {step.done && !step.active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8DB89A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    {step.active && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "white" }} />}
                  </div>
                  {i < trackingSteps.length - 1 && (
                    <div style={{ width: 2, height: 28, background: step.done ? "rgba(141,184,154,0.4)" : "var(--border)", margin: "2px 0" }} />
                  )}
                </div>
                <div style={{ paddingBottom: i < trackingSteps.length - 1 ? 16 : 0, paddingTop: 4 }}>
                  <p style={{ fontFamily: "Nunito", fontSize: 14, fontWeight: step.active ? 800 : step.done ? 600 : 500, color: step.active ? "var(--primary)" : step.done ? "var(--foreground)" : "var(--muted-foreground)", margin: 0 }}>
                    {step.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping info */}
        <div style={{ margin: "0 24px 24px", padding: "16px 18px", background: "white", borderRadius: 20, border: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "Nunito", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Kargo Bilgileri</p>
          {[
            { label: "Tahmini Teslimat", value: "25–27 Ağustos 2026" },
            { label: "Kargo Firması", value: "Yurtiçi Kargo" },
            { label: "Takip Numarası", value: "YK8432109876TR" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500 }}>{row.label}</span>
              <span style={{ fontFamily: "Nunito", fontSize: 13, color: "var(--foreground)", fontWeight: 700 }}>{row.value}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: "0 24px" }}>
          <button style={{ width: "100%", padding: "16px", borderRadius: 18, background: "var(--secondary)", border: "none", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, color: "var(--primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            📦 Kargoyu Takip Et
          </button>
        </div>
      </div>
    )
  }

  // Empty state
  if (orders.length === 0) {
    return (
      <div style={{ width: "100%", height: 844, background: "var(--background)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Siparişlerim</h1>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", gap: 16, textAlign: "center" }}>
          <span style={{ fontSize: 56 }}>📦</span>
          <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--foreground)", margin: 0, lineHeight: 1.3 }}>Henüz bir kitap siparişin yok.</h3>
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>Oluşturduğun masalları gerçek bir kitaba dönüştürebilirsin.</p>
          <button onClick={onBack} style={{ padding: "16px 28px", borderRadius: 18, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 8, boxShadow: "0 6px 20px rgba(124,92,191,0.35)" }}>
            Hikâyelerime Git
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: 844, overflowY: "auto", background: "var(--background)", paddingBottom: 40 }} className="screen-scroll">
      <div style={{ padding: "52px 24px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: "50%", background: "white", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "var(--muted-foreground)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Orders/01-List</p>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>Siparişlerim</h1>
        </div>
      </div>

      <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.map((order) => {
          const st = statusLabels[order.status]
          return (
            <div key={order.id} onClick={() => { setSelectedOrder(order); setView("tracking") }} style={{ padding: "16px", background: "white", borderRadius: 20, border: "1px solid var(--border)", cursor: "pointer", display: "flex", gap: 14, alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ width: 56, height: 72, borderRadius: 10, background: order.cover, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, boxShadow: "4px 4px 12px rgba(0,0,0,0.15)" }}>
                {order.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "Fraunces, serif", fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: "0 0 4px" }}>{order.title}</p>
                <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "0 0 6px", fontWeight: 500 }}>#{order.id} · {order.date}</p>
                <span style={{ fontFamily: "Nunito", fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 8, padding: "3px 10px" }}>{st.label}</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </div>
          )
        })}
      </div>
    </div>
  )
}
