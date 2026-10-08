import { FilePlus2, Music, RefreshCw } from 'lucide-react';
import { useStudio, useUi } from '../store';
import { engine, useTransport } from '../audio/engine';
import Dialog from './Dialog';

export default function ProjectMenu({ onClose }: { onClose: () => void }) {
  const newProject = useStudio((s) => s.newProject);
  const loadDemo = useStudio((s) => s.loadDemo);
  const velocity = useUi((s) => s.velocity);
  const setVelocity = useUi((s) => s.setVelocity);
  const rowHeight = useUi((s) => s.rowHeight);
  const zoomY = useUi((s) => s.zoomY);
  const pianoSamples = useTransport((s) => s.pianoSamples);

  const confirmThen = (msg: string, fn: () => void) => {
    if (window.confirm(msg)) {
      engine.stop();
      fn();
      onClose();
    }
  };

  return (
    <Dialog title="Project" onClose={onClose}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => confirmThen('Start a new empty project? (You can undo this.)', newProject)}
          className="flex h-11 w-full items-center gap-3 rounded-xl bg-stone-800 px-3 text-sm font-medium active:bg-stone-700"
        >
          <FilePlus2 className="h-4 w-4 text-amber-400" /> New empty project
        </button>
        <button
          type="button"
          onClick={() => confirmThen('Replace the current project with the demo? (You can undo this.)', loadDemo)}
          className="flex h-11 w-full items-center gap-3 rounded-xl bg-stone-800 px-3 text-sm font-medium active:bg-stone-700"
        >
          <Music className="h-4 w-4 text-amber-400" /> Load demo song
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="flex justify-between text-stone-300">
          New note velocity <span className="tabular-nums text-stone-400">{Math.round(velocity * 100)}%</span>
        </span>
        <input type="range" className="w-full" min={0.05} max={1} step={0.05} value={velocity} onChange={(e) => setVelocity(Number(e.target.value))} />
      </label>

      <div className="mt-2 flex items-center justify-between text-sm text-stone-300">
        Row height
        <div className="flex gap-1">
          <button type="button" className="h-8 w-9 rounded-lg bg-stone-800 active:bg-stone-700" onClick={() => zoomY(1 / 1.15)} aria-label="Shorter rows">
            −
          </button>
          <span className="flex w-10 items-center justify-center tabular-nums text-stone-400">{rowHeight}px</span>
          <button type="button" className="h-8 w-9 rounded-lg bg-stone-800 active:bg-stone-700" onClick={() => zoomY(1.15)} aria-label="Taller rows">
            +
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-stone-950 p-3 text-xs text-stone-400">
        <span>
          Piano:{' '}
          {pianoSamples === 'ready'
            ? 'Salamander Grand samples'
            : pianoSamples === 'loading'
              ? 'loading samples…'
              : pianoSamples === 'fallback'
                ? 'offline synth (samples unavailable)'
                : 'synth'}
        </span>
        {pianoSamples === 'fallback' && (
          <button type="button" onClick={() => engine.loadPiano()} className="flex items-center gap-1 text-amber-400">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
        Tap a cell to add a note · drag right to lengthen · tap a note to delete · drag a note to move · drag its right edge to resize ·
        two fingers to scroll & pinch-zoom · tap the keyboard to audition. Your project autosaves on this device.
      </p>
    </Dialog>
  );
}
