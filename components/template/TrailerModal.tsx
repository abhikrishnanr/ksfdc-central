'use client';

import { useEffect } from 'react';

function youtubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const parts = parsed.pathname.split('/').filter(Boolean);
    const embedIndex = parts.findIndex((part) => part === 'embed' || part === 'shorts');
    return embedIndex >= 0 ? parts[embedIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

export default function TrailerModal({ title, url, open, onClose }: { title: string; url?: string | null; open: boolean; onClose: () => void }) {
  const videoId = url ? youtubeId(url) : null;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !videoId) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${title} trailer`} onClick={onClose}>
      <div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button type="button" className="rounded-md border border-white/25 px-4 py-2 text-sm font-bold text-white hover:bg-white/10" onClick={onClose}>Close</button>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
