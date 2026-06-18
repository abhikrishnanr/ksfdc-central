export default function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <section className="empty-state"><h2>{label}</h2><p>Please wait.</p></section>;
}
