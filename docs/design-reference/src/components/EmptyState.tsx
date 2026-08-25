interface Props {
  icon: string
  title: string
  description?: string
  primaryLabel?: string
  primaryAction?: () => void
  secondaryLabel?: string
  secondaryAction?: () => void
  variant?: "page" | "card"
}

// State/Empty — reusable empty state component
export default function EmptyState({ icon, title, description, primaryLabel, primaryAction, secondaryLabel, secondaryAction, variant = "page" }: Props) {
  const isCard = variant === "card"
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: isCard ? "32px 24px" : "64px 32px", gap: isCard ? 12 : 16, textAlign: "center" }}>
      <div style={{ width: isCard ? 64 : 80, height: isCard ? 64 : 80, borderRadius: "50%", background: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isCard ? 32 : 40 }}>
        {icon}
      </div>
      <div>
        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: isCard ? 18 : 22, fontWeight: 600, color: "var(--foreground)", margin: "0 0 8px", lineHeight: 1.3 }}>
          {title}
        </h3>
        {description && (
          <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6, fontWeight: 500, maxWidth: 280 }}>
            {description}
          </p>
        )}
      </div>
      {primaryLabel && primaryAction && (
        <button onClick={primaryAction} style={{ padding: "16px 28px", borderRadius: 18, background: "linear-gradient(135deg, #9B7FD4, #7C5CBF)", border: "none", color: "white", fontFamily: "Nunito", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 20px rgba(124,92,191,0.3)", marginTop: 4 }}>
          {primaryLabel}
        </button>
      )}
      {secondaryLabel && secondaryAction && (
        <button onClick={secondaryAction} style={{ padding: "12px 24px", borderRadius: 16, background: "none", border: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "Nunito", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {secondaryLabel}
        </button>
      )}
    </div>
  )
}
