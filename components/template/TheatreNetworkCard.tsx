import Link from 'next/link';

export default function TheatreNetworkCard() {
  return (
    <section className="side-info-card theatre-network-card">
      <div>
        <p className="side-card-title">▥ Theatre Network</p>
        <strong>360+</strong>
        <span>Theatres across Kerala</span>
        <Link className="outline-gold-button" href="/theatres">View Theatres</Link>
      </div>
      <div className="kerala-map-mark" aria-hidden="true" />
    </section>
  );
}
