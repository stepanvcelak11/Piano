import { useEffect, useState } from 'react';
import { AudioLines, Download, ExternalLink, FileJson, Loader2, Music2 } from 'lucide-react';
import { projectOf, useStudio } from '../store';
import { renderProjectToWav } from '../audio/export';
import { engine } from '../audio/engine';
import { projectToMidi } from '../lib/midi';
import { canSave, FULL_APP_URL, saveFile, slug, type SaveOutcome } from '../lib/save';
import Dialog from './Dialog';

type Phase =
  | { kind: 'idle' }
  | { kind: 'rendering' }
  | { kind: 'done'; blob: Blob; url: string; name: string }
  | { kind: 'error'; message: string };

function outcomeText(o: SaveOutcome | null) {
  if (o === 'saved') return 'Saved.';
  if (o === 'cancelled') return 'Save cancelled.';
  if (o === 'unsupported') return 'This preview can’t save that file type. Open the full app to export it.';
  return null;
}

function FullAppNote() {
  return (
    <p className="rounded-lg bg-stone-950 p-2 text-xs text-stone-400">
      Audio and MIDI files can’t be saved from this preview.{' '}
      <a href={FULL_APP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-amber-400 underline">
        Open the full app <ExternalLink className="h-3 w-3" />
      </a>{' '}
      to save them.
    </p>
  );
}

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const [loops, setLoops] = useState(1);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [status, setStatus] = useState<string | null>(null);
  const base = slug(useStudio.getState().name);

  useEffect(() => engine.stop(), []);
  useEffect(() => () => void (phase.kind === 'done' && URL.revokeObjectURL(phase.url)), [phase]);

  const render = async () => {
    setPhase({ kind: 'rendering' });
    setStatus(null);
    try {
      const s = useStudio.getState();
      const blob = await renderProjectToWav(projectOf(s), loops);
      setPhase({ kind: 'done', blob, url: URL.createObjectURL(blob), name: `${base}-${s.bpm}bpm.wav` });
    } catch (err) {
      console.error(err);
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Rendering failed. Try again.' });
    }
  };

  const save = async (blob: Blob, name: string) => setStatus(outcomeText(await saveFile(blob, name)));

  const saveMidi = () => {
    const bytes = projectToMidi(projectOf(useStudio.getState()));
    void save(new Blob([bytes], { type: 'audio/midi' }), `${base}.mid`);
  };
  const saveJson = () => {
    const json = JSON.stringify({ app: 'crossover-studio', version: 2, project: projectOf(useStudio.getState()) }, null, 1);
    void save(new Blob([json], { type: 'application/json' }), `${base}.json`);
  };

  const audioAllowed = canSave('x.wav');

  return (
    <Dialog title="Export" onClose={onClose}>
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-200">
          <AudioLines className="h-4 w-4 text-amber-400" /> Audio (WAV)
        </h3>
        <p className="text-xs text-stone-400">All audible tracks with mixer and reverb, 44.1 kHz stereo.</p>
        <div className="flex items-center gap-2 text-sm">
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
        {phase.kind === 'done' ? (
          <div className="space-y-2">
            <audio controls src={phase.url} className="h-10 w-full" />
            {audioAllowed && (
              <button
                type="button"
                onClick={() => void save(phase.blob, phase.name)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 font-semibold text-stone-950 active:scale-[0.98]"
              >
                <Download className="h-5 w-5" /> Save WAV ({(phase.blob.size / 1024 / 1024).toFixed(1)} MB)
              </button>
            )}
          </div>
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
              'Render mixdown'
            )}
          </button>
        )}
        {phase.kind === 'error' && <p className="text-sm text-rose-400">{phase.message}</p>}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={saveMidi}
          disabled={!audioAllowed}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-800 text-sm font-medium active:bg-stone-700 disabled:opacity-40"
        >
          <Music2 className="h-4 w-4 text-sky-400" /> MIDI file
        </button>
        <button
          type="button"
          onClick={saveJson}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-800 text-sm font-medium active:bg-stone-700"
        >
          <FileJson className="h-4 w-4 text-lime-400" /> Project file
        </button>
      </section>
      <p className="mt-2 text-[11px] text-stone-500">MIDI opens in FL Studio, Logic, Ableton, MuseScore and others. The project file can be opened again here.</p>
      {!audioAllowed && <div className="mt-3"><FullAppNote /></div>}
      {status && <p className="mt-2 text-sm text-stone-300" role="status">{status}</p>}
    </Dialog>
  );
}
