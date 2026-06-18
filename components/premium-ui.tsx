import Link from 'next/link';
import type { ReactNode } from 'react';

type Tone = 'good' | 'bad' | 'warn' | 'info' | 'violet' | 'neutral';

function toneClass(tone: Tone) {
  if (tone === 'neutral') return '';
  return ` status-${tone}`;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="hero-panel">
      <div className="page-header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions ? <div className="meta-row">{actions}</div> : null}
      </div>
    </section>
  );
}

export function PremiumCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`premium-card ${className}`.trim()}>{children}</section>;
}

export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass-panel ${className}`.trim()}>{children}</section>;
}

export function StatCard({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail?: ReactNode; tone?: Tone }) {
  return (
    <section className={`premium-card stat-card${toneClass(tone)}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? <p className="stat-detail">{detail}</p> : null}
    </section>
  );
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-badge${toneClass(tone)}`}>{children}</span>;
}

export function ActionButton({ href, children, variant = 'default' }: { href: string; children: ReactNode; variant?: 'default' | 'primary' | 'warn' }) {
  return <Link className={`action-button ${variant}`} href={href}>{children}</Link>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ErrorState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="error-state">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function MetricTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
