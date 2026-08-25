type ErrorVariant = "network" | "server" | "generation" | "payment" | "voice" | "illustration"

interface Props {
  variant?: ErrorVariant
  title?: string
  description?: string
  onRetry?: () => void
}

const variantConfig: Record<ErrorVariant, { icon: string; title: string; description: string }> = {
  network: { icon: "📡", title: "Bağlantı kurulamadı.", description: "İnternet bağlantını kontrol edip tekrar deneyebilirsin." },
  server: { icon: "⚡", title: "Bir şeyler yolunda gitmedi.", description: "Sunucumuzda geçici bir sorun oluştu. Kısa süre içinde düzelecek." },
  generation: { icon: "✨", title: "Hikâye oluşturulamadı.", description: "Masalın hazırlanırken bir sorun oluştu. Tekrar deneyebilirsin." },
  payment: { icon: "💳", title: "Ödeme işlemi başarısız.", description: "Kart bilgilerini kontrol edip tekrar deneyebilirsin." },
  voice: { icon: "🎙", title: "Ses hazırlanamadı.", description: "Ses klonlama sırasında bir sorun oluştu. Lütfen tekrar dene." },
  illustration: { icon: "🎨", title: "Görsel oluşturulamadı.", description: "İllüstrasyon hazırlanırken bir sorun oluştu. Tekrar deneyelim." },
}

// State/Error — reusable error state component with variants
export default function ErrorState({ variant = "server", title, description, onRetry }: Props) {
  const config = variantConfig[variant]
  const displayTitle = title ?? config.title
  const displayDesc = description ?? config.description

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px", gap: 16, textAlign: "center" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(240,139,110,0.1)", border: "2px solid rgba(240,139,110,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
        {config.icon}
      </div>
      <div>
        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", lineHeight: 1.3 }}>
          {displayTitle}
        </h3>
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500, maxWidth: 280 }}>
          {displayDesc}
        </p>
      </div>
      {onRetry && (
        <button onClick={onRetry} style={{ padding: "14px 28px", borderRadius: 18, background: "white", border: "1.5px solid var(--border)", color: "var(--foreground)", fontFamily: "Nunito", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          🔄 Tekrar Dene
        </button>
      )}
    </div>
  )
}
