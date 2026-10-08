import { Trash2, X } from 'lucide-react';
import { useStudio, useUi } from '../store';
import { INSTRUMENT_ORDER, INSTRUMENTS, MAX_VOLUME_DB, MIN_VOLUME_DB } from '../lib/music';

function formatDb(db: number) {
  if (db <= MIN_VOLUME_DB) return '-∞';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
}

/** Slide-over mixer: volume, reverb send, mute / solo, piano sustain, clear. */
export default function MixerPanel() {
  const open = useUi((s) => s.mixerOpen);
  const setOpen = useUi((s) => s.setMixerOpen);
  const tracks = useStudio((s) => s.tracks);
  const updateTrack = useStudio((s) => s.updateTrack);
  const clearTrack = useStudio((s) => s.clearTrack);

  if (!open) return null;
  return (
    <>
      <div className="absolute inset-0 z-20 bg-black/40" onClick={() => setOpen(false)} />
      <aside
        aria-label="Mixer"
        className="absolute inset-y-0 right-0 z-30 flex w-[min(360px,92%)] flex-col border-l border-stone-800 bg-stone-950/98 shadow-2xl"
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-stone-800 px-3">
          <h2 className="text-sm font-semibold">Mixer</h2>
          <button type="button" aria-label="Close mixer" onClick={() => setOpen(false)} className="rounded p-1.5 text-stone-400 active:bg-stone-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain p-2">
          {INSTRUMENT_ORDER.map((id) => {
            const t = tracks[id];
            const meta = INSTRUMENTS[id];
            return (
              <section key={id} className="rounded-lg bg-stone-900 p-2 ring-1 ring-stone-800" style={{ ['--thumb' as string]: meta.color }}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  <span className="text-sm font-semibold">{meta.name}</span>
                  <div className="ml-auto flex gap-1">
                    {id === 'piano' && (
                      <button
                        type="button"
                        aria-pressed={!!t.sustain}
                        onClick={() => updateTrack(id, { sustain: !t.sustain })}
                        className={`h-7 rounded px-2 text-[11px] font-bold ${t.sustain ? 'bg-sky-400 text-stone-950' : 'bg-stone-950 text-stone-400'}`}
                      >
                        PEDAL
                      </button>
                    )}
                    {id === 'bass' && (
                      <button
                        type="button"
                        onClick={() => updateTrack(id, { articulation: t.articulation === 'pizz' ? 'arco' : 'pizz' })}
                        className="h-7 rounded bg-sky-400 px-2 text-[11px] font-bold text-stone-950"
                        title="Bowed (arco) or plucked (pizzicato)"
                      >
                        {t.articulation === 'pizz' ? 'PIZZ' : 'ARCO'}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Mute ${meta.name}`}
                      aria-pressed={t.muted}
                      onClick={() => updateTrack(id, { muted: !t.muted })}
                      className={`h-7 w-7 rounded text-[11px] font-bold ${t.muted ? 'bg-rose-500 text-stone-950' : 'bg-stone-950 text-stone-400'}`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      aria-label={`Solo ${meta.name}`}
                      aria-pressed={t.solo}
                      onClick={() => updateTrack(id, { solo: !t.solo })}
                      className={`h-7 w-7 rounded text-[11px] font-bold ${t.solo ? 'bg-amber-400 text-stone-950' : 'bg-stone-950 text-stone-400'}`}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      aria-label={`Clear all ${meta.name} notes`}
                      disabled={t.notes.length === 0}
                      onClick={() => clearTrack(id)}
                      className="flex h-7 w-7 items-center justify-center rounded bg-stone-950 text-stone-400 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <label className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                  <span className="w-10">Vol</span>
                  <input
                    type="range"
                    className="flex-1"
                    min={MIN_VOLUME_DB}
                    max={MAX_VOLUME_DB}
                    step={0.5}
                    value={t.volume}
                    onChange={(e) => updateTrack(id, { volume: Number(e.target.value) })}
                    onDoubleClick={() => updateTrack(id, { volume: 0 })}
                  />
                  <span className="w-10 text-right tabular-nums">{formatDb(t.volume)}</span>
                </label>
                <label className="flex items-center gap-2 text-[11px] text-stone-400">
                  <span className="w-10">Reverb</span>
                  <input
                    type="range"
                    className="flex-1"
                    min={0}
                    max={1}
                    step={0.01}
                    value={t.reverbSend}
                    onChange={(e) => updateTrack(id, { reverbSend: Number(e.target.value) })}
                  />
                  <span className="w-10 text-right tabular-nums">{Math.round(t.reverbSend * 100)}%</span>
                </label>
              </section>
            );
          })}
        </div>
      </aside>
    </>
  );
}
