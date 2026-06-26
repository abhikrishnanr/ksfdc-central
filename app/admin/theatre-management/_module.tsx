import Link from 'next/link';

export function ManagementNav() {
  const links = [
    ['/admin/theatre-management', 'Dashboard'],
    ['/admin/theatre-management/theatres', 'Theatres'],
    ['/admin/theatre-management/movies', 'Movies'],
    ['/admin/theatre-management/shows', 'Shows']
  ] as const;
  return (
    <nav className="meta-row management-module-nav" aria-label="Theatre management module">
      {links.map(([href, label]) => <Link key={href} className="action-button" href={href}>{label}</Link>)}
    </nav>
  );
}

export function AdminField({ label, name, defaultValue, type = 'text', required = false }: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue ?? ''} />
    </label>
  );
}
