import { useStudio } from '../store';
import { INSTRUMENT_ORDER, INSTRUMENTS } from '../lib/music';

/** Vertical instrument selector with quick mute / solo. */
export default function TrackRail() {
  const tracks = useStudio((s) => s.tracks);
  const active = useStudio((s) => s.activeTrackId);
  const setActive = useStudio((s) => s.setActiveTrack);
  const updateTrack = useStudio((s) => s.updateTrack);

  return (
    <nav aria-label="Tracks" className="scrollbar-none flex w-[92px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-stone-800 bg-stone-950 p-1">
      {INSTRUMENT_ORDER.map((id) => {
        const t = tracks[id];
        const meta = INSTRUMENTS[id];
        const isActive = id === active;
        return (
          <div
            key={id}
            className={`flex min-h-[46px] flex-1 flex-col justify-between gap-0.5 rounded-lg p-1 ring-1 transition-colors ${
              isActive ? 'bg-stone-800 ring-stone-600' : 'bg-stone-900/60 ring-stone-800'
            }`}
            style={isActive ? { boxShadow: `inset 3px 0 0 ${meta.color}` } : undefined}
          >
            <button
              type="button"
              onClick={() => setActive(id)}
              aria-current={isActive}
              className="flex items-center gap-1 truncate px-0.5 text-left text-[11px] font-semibold text-stone-100"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
              <span className="truncate">{meta.short}</span>
              {t.notes.length > 0 && <span className="ml-auto text-[9px] font-normal text-stone-500">{t.notes.length}</span>}
            </button>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label={`Mute ${meta.short}`}
                aria-pressed={t.muted}
                onClick={() => updateTrack(id, { muted: !t.muted })}
                className={`h-5 flex-1 rounded text-[10px] font-bold ${t.muted ? 'bg-rose-500 text-stone-950' : 'bg-stone-950 text-stone-400'}`}
              >
                M
              </button>
              <button
                type="button"
                aria-label={`Solo ${meta.short}`}
                aria-pressed={t.solo}
                onClick={() => updateTrack(id, { solo: !t.solo })}
                className={`h-5 flex-1 rounded text-[10px] font-bold ${t.solo ? 'bg-amber-400 text-stone-950' : 'bg-stone-950 text-stone-400'}`}
              >
                S
              </button>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
