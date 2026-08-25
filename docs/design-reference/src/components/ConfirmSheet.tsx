interface Props {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  variant?: "neutral" | "destructive"
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmSheet({
  title,
  description,
  confirmLabel,
  cancelLabel = "Vazgeç",
  variant = "neutral",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", zIndex: 300 }}
      onClick={onCancel}
    >
      <div
        style={{ width: 390, background: "white", borderRadius: "24px 24px 0 0", padding: "20px 24px 48px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 24px" }} />

        {variant === "destructive" && (
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(224,84,84,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 16px" }}>
            🗑
          </div>
        )}

        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: "var(--foreground)", margin: "0 0 10px", textAlign: "center", lineHeight: 1.3 }}>
          {title}
        </h3>
        <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", textAlign: "center", margin: "0 0 28px", lineHeight: 1.6, fontWeight: 500 }}>
          {description}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onConfirm}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 18,
              background: variant === "destructive" ? "#E05454" : "linear-gradient(135deg, #9B7FD4, #7C5CBF)",
              border: "none",
              color: "white",
              fontFamily: "Nunito",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: variant === "destructive" ? "0 6px 20px rgba(224,84,84,0.3)" : "0 6px 20px rgba(124,92,191,0.3)",
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{ width: "100%", padding: "16px", borderRadius: 18, background: "var(--muted)", border: "none", fontFamily: "Nunito", fontSize: 16, fontWeight: 700, color: "var(--foreground)", cursor: "pointer" }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
