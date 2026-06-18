import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';

export default function TheatreNetworkCard() {
  return (
    <section className="side-info-card theatre-network-card">
      <div><p className="side-card-title"><Building2 size={19} /> Theatre Network</p><strong>360+</strong><span>Theatres across Kerala</span><Link className="outline-gold-button" href="/theatres">View theatres <ArrowRight size={17} /></Link></div>
      <div className="kerala-map-mark" aria-hidden="true" />
    </section>
  );
}
