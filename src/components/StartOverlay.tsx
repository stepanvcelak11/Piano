import { useState } from 'react';
import { Loader2, Piano } from 'lucide-react';
import { engine } from '../audio/engine';

/** Mobile browsers keep Web Audio suspended until a user gesture – this overlay provides it. */
export default function StartOverlay() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await engine.init();
    } catch (err) {
      console.error(err);
      setError('Audio could not be started. Check that your browser supports Web Audio and try again.');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={enter}
      className="no-touch safe-area fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_center,#292524_0%,#0c0a09_70%)] text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/15 ring-1 ring-amber-500/40">
        {busy ? <Loader2 className="h-10 w-10 animate-spin text-amber-400" /> : <Piano className="h-10 w-10 text-amber-400" />}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-100">Crossover Studio</h1>
        <p className="mt-1 text-sm text-stone-400">Piano · Strings · Bass · Cajón</p>
      </div>
      <span className="rounded-full bg-amber-500 px-7 py-3 text-base font-semibold text-stone-950 shadow-lg shadow-amber-500/20 active:scale-95">
        {busy ? 'Starting audio…' : 'Tap to Enter Studio'}
      </span>
      {error && <p className="max-w-xs text-sm text-rose-400">{error}</p>}
      <p className="max-w-xs text-xs text-stone-500">Tip: turn off silent mode and use headphones for the best sound.</p>
    </button>
  );
}
