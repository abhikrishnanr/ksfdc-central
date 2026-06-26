'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function PosterFileInput({ currentPosterUrl, label = 'Poster image' }: { currentPosterUrl?: string | null; label?: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <label className="admin-field poster-upload-field">
      <span>{label}</span>
      <input
        name="posterFile"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          const file = event.currentTarget.files?.[0];
          setPreviewUrl(file ? URL.createObjectURL(file) : null);
        }}
      />
      <span className="poster-upload-preview">
        {previewUrl || currentPosterUrl ? (
          <Image
            src={previewUrl ?? currentPosterUrl ?? ''}
            alt="Selected poster preview"
            width={120}
            height={180}
            sizes="120px"
            unoptimized={Boolean(previewUrl)}
          />
        ) : (
          <strong>No poster selected</strong>
        )}
      </span>
      <small>JPEG, PNG, or WebP. Existing poster is kept if you do not choose a new file.</small>
    </label>
  );
}
