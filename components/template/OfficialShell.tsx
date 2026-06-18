import type { ReactNode } from 'react';

export default function OfficialShell({ children }: { children: ReactNode }) {
  return <section className="grid gap-6">{children}</section>;
}
