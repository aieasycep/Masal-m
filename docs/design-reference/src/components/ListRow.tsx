import { useState } from "react"

type RowVariant = "default" | "toggle" | "destructive" | "disabled"

interface Props {
  icon?: string
  label: string
  sub?: string
  badge?: string
  variant?: RowVariant
  toggleValue?: boolean
  onToggle?: () => void
  onClick?: () => void
  showDivider?: boolean
}

// ListRow/Navigation — reusable settings/profile list row
// Variants: default (chevron), toggle (switch), destructive (red), disabled (muted)
export default function ListRow({ icon, label, sub, badge, variant = "default", toggleValue, onToggle, onClick, showDivider = true }: Props) {
  const [pressed, setPressed] = useState(false)
  const isDestructive = variant === "destructive"
  const isDisabled = variant === "disabled"
  const isToggle = variant === "toggle"

  return (
    <>
      <div
        onClick={!isToggle && !isDisabled && onClick ? onClick : undefined}
        onMouseDown={() => !isToggle && !isDisabled && setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          cursor: !isToggle && !isDisabled && onClick ? "pointer" : "default",
          opacity: isDisabled ? 0.4 : 1,
          background: pressed ? "var(--muted)" : "transparent",
          transition: "background 0.1s ease",
        }}
      >
        {icon && (
          <div style={{ width: 38, height: 38, borderRadius: 11, background: isDestructive ? "rgba(224,84,84,0.08)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "Nunito", fontSize: 15, fontWeight: 600, color: isDestructive ? "#E05454" : "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </p>
          {sub && (
            <p style={{ fontFamily: "Nunito", fontSize: 12, color: "var(--muted-foreground)", margin: "1px 0 0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sub}
            </p>
          )}
        </div>
        {badge && (
          <span style={{ fontFamily: "Nunito", fontSize: 10, fontWeight: 700, color: "var(--primary)", background: "var(--secondary)", borderRadius: 8, padding: "3px 10px", flexShrink: 0 }}>
            {badge}
          </span>
        )}
        {isToggle ? (
          <div
            onClick={(e) => { e.stopPropagation(); if (!isDisabled && onToggle) onToggle() }}
            style={{ width: 48, height: 28, borderRadius: 14, background: toggleValue ? "var(--primary)" : "var(--border)", position: "relative", cursor: "pointer", transition: "background 0.2s ease", flexShrink: 0 }}
          >
            <div style={{ position: "absolute", width: 22, height: 22, borderRadius: "50%", background: "white", top: 3, left: toggleValue ? 23 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }} />
          </div>
        ) : !isDestructive ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        ) : null}
      </div>
      {showDivider && <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />}
    </>
  )
}
