import Link from 'next/link';

const notices = [
  { icon: '◔', text: 'New show timings feature is now available.', date: '20 May 2024' },
  { icon: '%', text: 'Enjoy special discounts on weekend shows!', date: '18 May 2024' },
  { icon: '▣', text: 'Dear Patron, carry your valid ID proof while collecting tickets.', date: '16 May 2024' }
];

export default function NoticesCard() {
  return (
    <section className="side-info-card notices-card">
      <div className="section-title-row compact">
        <h2>📣 Notices</h2>
        <Link href="/shows">View All ›</Link>
      </div>
      <div className="notice-list">
        {notices.map((notice) => (
          <article key={notice.text}>
            <span>{notice.icon}</span>
            <div>
              <p>{notice.text}</p>
              <small>{notice.date}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
