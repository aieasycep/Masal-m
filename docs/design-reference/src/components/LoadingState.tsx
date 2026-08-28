type LoadingVariant = "page" | "list" | "card" | "generation" | "audio" | "image"

interface Props {
  variant?: LoadingVariant
  label?: string
  progress?: number
}

function SkeletonBlock({ width, height, radius = 8, style }: { width: string | number; height: number; radius?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ width, height, borderRadius: radius, background: "linear-gradient(90deg, var(--muted) 25%, var(--border) 50%, var(--muted) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite", ...style }} />
  )
}

// State/Loading — reusable loading state with variants
export default function LoadingState({ variant = "page", label, progress }: Props) {
  // Page — centered spinner
  if (variant === "page") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 32px", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid var(--secondary)", borderTopColor: "var(--primary)", animation: "spin-slow 0.9s linear infinite" }} />
      {label && <p style={{ fontFamily: "Nunito", fontSize: 14, color: "var(--muted-foreground)", margin: 0, fontWeight: 600 }}>{label}</p>}
    </div>
  )

  // List — skeleton rows
  if (variant === "list") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 24px" }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0" }}>
          <SkeletonBlock width={72} height={90} radius={12} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonBlock width="70%" height={14} />
            <SkeletonBlock width="50%" height={12} />
            <SkeletonBlock width="40%" height={10} />
          </div>
        </div>
      ))}
    </div>
  )

  // Card — single skeleton card
  if (variant === "card") return (
    <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid var(--border)" }}>
      <SkeletonBlock width="100%" height={120} radius={0} />
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <SkeletonBlock width="60%" height={14} />
        <SkeletonBlock width="40%" height={12} />
      </div>
    </div>
  )

  // AI Generation — masalsı gece modu
  if (variant === "generation") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "48px 32px", background: "#0D1B2E", borderRadius: 24 }}>
      <div style={{ position: "relative", width: 80, height: 80 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid rgba(155,127,212,0.2)", borderTopColor: "#9B7FD4", animation: "spin-slow 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 12, borderRadius: "50%", border: "3px solid rgba(240,139,110,0.2)", borderTopColor: "#F08B6E", animation: "spin-slow 1.4s linear infinite reverse" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>✨</div>
      </div>
      {label && <p style={{ fontFamily: "Nunito", fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0, fontWeight: 600, textAlign: "center" }}>{label}</p>}
      {progress !== undefined && (
        <div style={{ width: 200 }}>
          <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, borderRadius: 3, background: "linear-gradient(90deg, #9B7FD4, #F08B6E)", transition: "width 0.3s ease" }} />
          </div>
          <p style={{ fontFamily: "Nunito", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", margin: "6px 0 0", fontWeight: 500 }}>{progress}%</p>
        </div>
      )}
    </div>
  )

  // Audio — waveform animation
  if (variant === "audio") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 40 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="wave-bar" style={{ width: 4, borderRadius: 2, background: "var(--primary)", opacity: 0.8 }} />
      ))}
    </div>
  )

  // Image — skeleton with camera icon
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--muted)", borderRadius: 16, height: 180 }}>
      <span style={{ fontSize: 32, opacity: 0.3 }}>🖼</span>
      <div style={{ width: 80, height: 8, borderRadius: 4, background: "linear-gradient(90deg, var(--border) 25%, var(--secondary) 50%, var(--border) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />
    </div>
  )
}
