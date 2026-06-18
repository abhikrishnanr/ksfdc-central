import type { ReactNode } from 'react';

export default function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <section className="empty-state"><h2>{title}</h2>{children}</section>;
}
