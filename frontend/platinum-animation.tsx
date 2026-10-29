import { useEffect, useState } from 'react';
import { platinumAnimation, trophyImages } from './ps5-assets';

let animationBlob: Blob | undefined;

function createPlaybackUrl() {
  if (!animationBlob) {
    const encoded = platinumAnimation.slice(platinumAnimation.indexOf(',') + 1);
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    animationBlob = new Blob([bytes], { type: 'image/webp' });
  }
  // A unique URL gives each notification its own WebP playback clock.
  return URL.createObjectURL(animationBlob);
}

export function PlatinumAnimation({ active }: { active: boolean }) {
  const [source, setSource] = useState<string>();
  const [staticPoster, setStaticPoster] = useState(false);
  useEffect(() => {
    if (!active) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let playbackUrl: string | undefined;
    const update = () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
      playbackUrl = preference.matches ? undefined : createPlaybackUrl();
      setStaticPoster(preference.matches);
      setSource(playbackUrl);
    };
    update();
    preference.addEventListener('change', update);
    return () => {
      preference.removeEventListener('change', update);
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [active]);

  if (!active || (!source && !staticPoster)) return <span aria-hidden="true" />;
  const animated = !staticPoster && source;
  return <img className={animated ? 'trophy-styles-platinum-animation' : 'trophy-styles-platinum-poster'}
    src={animated || trophyImages.platinum} alt="" onError={() => setStaticPoster(true)} />;
}
