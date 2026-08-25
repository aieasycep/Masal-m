type PreviewButtonState = "idle" | "loading" | "playing" | "paused" | "disabled" | "error"

interface Props {
  state: PreviewButtonState
  onPress: () => void
  size?: "sm" | "md"
}

// Audio/PreviewButton — reusable voice preview button
// Used in: StoryCreation/VoiceStep, VoiceStudio, NarrationSelect
export default function AudioPreviewButton({ state, onPress, size = "md" }: Props) {
  const dim = size === "sm" ? 32 : 40
  const iconSize = size === "sm" ? 12 : 16
  const isDisabled = state === "disabled"
  const isError = state === "error"

  const bgColor = isDisabled
    ? "var(--muted)"
    : isError
    ? "rgba(224,84,84,0.1)"
    : state === "playing"
    ? "var(--primary)"
    : "var(--secondary)"

  const iconColor = isDisabled
    ? "var(--muted-foreground)"
    : isError
    ? "#E05454"
    : state === "playing"
    ? "white"
    : "var(--primary)"

  return (
    <button
      onClick={isDisabled ? undefined : onPress}
      title={
        state === "idle" ? "Önizle"
        : state === "loading" ? "Yükleniyor…"
        : state === "playing" ? "Duraklat"
        : state === "paused" ? "Devam et"
        : state === "error" ? "Hata — tekrar dene"
        : "Devre dışı"
      }
      style={{
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: bgColor,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isDisabled ? "default" : "pointer",
        flexShrink: 0,
        transition: "background 0.2s ease, transform 0.1s ease",
        transform: "scale(1)",
      }}
    >
      {state === "loading" && (
        <div style={{ width: iconSize, height: iconSize, borderRadius: "50%", border: `2px solid ${iconColor}`, borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite" }} />
      )}
      {state === "playing" && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor}>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      )}
      {(state === "idle" || state === "paused" || state === "disabled") && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} style={{ marginLeft: 1 }}>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )}
      {state === "error" && (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      )}
    </button>
  )
}
