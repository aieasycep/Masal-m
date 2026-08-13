export type PillTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
