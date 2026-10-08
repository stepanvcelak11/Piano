import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useStudio } from '../store';
import { renderProjectToWav, saveBlob } from '../audio/export';
import { engine } from '../audio/engine';
import Dialog from './Dialog';

type Phase = { kind: 'idle' } | { kind: 'rendering' } | { kind: 'done'; blob: Blob; name: string } | { kind: 'error'; message: string };

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const [loops, setLoops] = useState(1);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => engine.stop(), []);

  const render = async () => {
    setPhase({ kind: 'rendering' });
    try {
      const s = useStudio.getState();
      const project = { bpm: s.bpm, totalBars: s.totalBars, activeTrackId: s.activeTrackId, showGhostNotes: s.showGhostNotes, tracks: s.tracks };
      const blob = await renderProjectToWav(project, loops);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      setPhase({ kind: 'done', blob, name: `crossover-${s.bpm}bpm-${stamp}.wav` });
    } catch (err) {
      console.error(err);
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Rendering failed' });
    }
  };

  return (
    <Dialog title="Export WAV" onClose={onClose}>
      <p className="text-sm text-stone-400">Renders all audible tracks with mixer & reverb to a 44.1 kHz stereo WAV.</p>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-stone-300">Repeat loop</span>
        {[1, 2, 4].map((n) => (
          <button
            key={n}
            type="button"
            disabled={phase.kind === 'rendering'}
            onClick={() => {
              setLoops(n);
              setPhase({ kind: 'idle' });
            }}
            className={`h-8 w-10 rounded-lg font-semibold ${loops === n ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300'}`}
          >
            {n}×
          </button>
        ))}
      </div>
      <div className="mt-4">
        {phase.kind === 'done' ? (
          <button
            type="button"
            onClick={() => void saveBlob(phase.blob, phase.name)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-semibold text-stone-950 active:scale-[0.98]"
          >
            <Download className="h-5 w-5" /> Save {(phase.blob.size / 1024 / 1024).toFixed(1)} MB WAV
          </button>
        ) : (
          <button
            type="button"
            onClick={render}
            disabled={phase.kind === 'rendering'}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-stone-950 active:scale-[0.98] disabled:opacity-60"
          >
            {phase.kind === 'rendering' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Rendering…
              </>
            ) : (
              'Render'
            )}
          </button>
        )}
        {phase.kind === 'error' && <p className="mt-2 text-sm text-rose-400">{phase.message}</p>}
      </div>
    </Dialog>
  );
}
