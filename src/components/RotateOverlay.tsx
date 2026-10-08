import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

/** Hook: true while the viewport is taller than it is wide. */
export function usePortrait() {
  const [portrait, setPortrait] = useState(isPortrait);
  useEffect(() => {
    const update = () => setPortrait(isPortrait());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    screen.orientation?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      screen.orientation?.removeEventListener?.('change', update);
    };
  }, []);
  return portrait;
}

/** Friendly rotate prompt; can be dismissed to use the vertical-scroll fallback layout. */
export default function RotateOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="safe-area fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-stone-950/95 px-8 text-center backdrop-blur">
      <RotateCw className="h-14 w-14 animate-[spin_3s_ease-in-out_infinite] text-amber-400" />
      <div>
        <h2 className="text-xl font-semibold text-stone-100">Rotate your phone</h2>
        <p className="mt-2 text-sm text-stone-400">
          The piano roll works best in landscape — more bars, bigger keys, less scrolling.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full border border-stone-600 px-5 py-2.5 text-sm font-medium text-stone-200 active:bg-stone-800"
      >
        Continue in portrait
      </button>
    </div>
  );
}
