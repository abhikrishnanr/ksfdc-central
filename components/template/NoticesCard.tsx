import Link from 'next/link';
import { ArrowRight, BadgePercent, CalendarDays, Megaphone, TicketCheck } from 'lucide-react';

const notices = [
  { icon: CalendarDays, text: 'New show timings feature is now available.', date: '20 May 2024' },
  { icon: BadgePercent, text: 'Enjoy special discounts on weekend shows!', date: '18 May 2024' },
  { icon: TicketCheck, text: 'Dear Patron, carry your valid ID proof while collecting tickets.', date: '16 May 2024' }
];

export default function NoticesCard() {
  return (
    <section className="side-info-card notices-card">
      <div className="section-title-row compact"><h2><Megaphone size={19} /> Notices</h2><Link href="/shows">View all <ArrowRight size={16} /></Link></div>
      <div className="notice-list">
        {notices.map((notice) => <article key={notice.text}><span><notice.icon size={17} /></span><div><p>{notice.text}</p><small>{notice.date}</small></div></article>)}
      </div>
    </section>
  );
}
