'use client';

import { LoaderCircle } from 'lucide-react';
import { useFormStatus } from 'react-dom';

export default function AdminSubmitButton({
  children,
  pendingLabel = 'Saving...',
  variant = 'primary'
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'warn' | 'default';
}) {
  const { pending } = useFormStatus();
  const variantClass = variant === 'default' ? '' : ` ${variant}`;
  return (
    <button className={`action-button${variantClass}`} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <LoaderCircle className="inline-spinner" size={16} aria-hidden="true" /> : null}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
