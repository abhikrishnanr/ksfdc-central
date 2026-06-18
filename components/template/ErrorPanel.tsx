import type { ReactNode } from 'react';

export default function ErrorPanel({ title, children }: { title: string; children?: ReactNode }) {
  return <section className="error-state"><h2>{title}</h2>{children}</section>;
}
