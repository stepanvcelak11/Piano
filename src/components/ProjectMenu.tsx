import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyPlus, FilePlus2, FolderOpen, Music, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { projectOf, useLibrary, useStudio, useUi } from '../store';
import { engine, useTransport, type SampleStatus } from '../audio/engine';
import { INSTRUMENTS, MAX_BARS, ROOT_NAMES, SCALES } from '../lib/music';
import type { ScaleType } from '../types';
import Dialog from './Dialog';

type Tab = 'project' | 'song' | 'track' | 'settings';

/** Two-step button: the first tap arms it, the second tap (within 3 s) runs the action. */
function ConfirmButton({ onConfirm, children, className = '', armedLabel = 'Tap again to confirm' }: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  armedLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          window.clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 3000);
        }
      }}
      className={`${className} ${armed ? '!bg-rose-500 !text-stone-950' : ''}`}
    >
      {armed ? armedLabel : children}
    </button>
  );
}

const rowBtn = 'flex h-11 w-full items-center gap-3 rounded-xl bg-stone-800 px-3 text-sm font-medium active:bg-stone-700 disabled:opacity-40';
const chip = 'h-9 min-w-11 rounded-lg bg-stone-800 px-2 text-sm font-semibold active:bg-stone-700 disabled:opacity-30';

function ProjectTab({ onClose }: { onClose: () => void }) {
  const name = useStudio((s) => s.name ?? 'Untitled');
  const setName = useStudio((s) => s.setName);
  const newProject = useStudio((s) => s.newProject);
  const loadDemo = useStudio((s) => s.loadDemo);
  const loadProject = useStudio((s) => s.loadProject);
  const { projects, save, remove } = useLibrary();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = (fn: () => void) => {
    engine.stop();
    fn();
    onClose();
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      open(() => loadProject(parsed?.project ?? parsed));
    } catch {
      setMsg('That file isn’t a Crossover project. Choose a .json file exported from this app.');
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-stone-400">Project name</span>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-10 w-full select-text rounded-lg bg-stone-950 px-3 text-stone-100 ring-1 ring-stone-700 outline-none focus:ring-amber-500"
        />
      </label>
      <button
        type="button"
        className={rowBtn}
        onClick={() => {
          save(projectOf(useStudio.getState()));
          setMsg(`Saved “${name || 'Untitled'}” to My projects.`);
        }}
      >
        <Save className="h-4 w-4 text-amber-400" /> Save to My projects
      </button>

      {projects.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">My projects</h4>
          <ul className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-stone-950 p-1.5 pl-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{p.name}</div>
                  <div className="text-[10px] text-stone-500">
                    {p.data.bpm} BPM · {p.data.totalBars} bars · {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <ConfirmButton
                  onConfirm={() => open(() => loadProject(p.data))}
                  armedLabel="Open?"
                  className="flex h-8 items-center gap-1 rounded-md bg-stone-800 px-2 text-xs"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Open
                </ConfirmButton>
                <ConfirmButton onConfirm={() => remove(p.id)} armedLabel="Delete?" className="flex h-8 items-center rounded-md bg-stone-800 px-2 text-xs text-stone-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <ConfirmButton onConfirm={() => open(newProject)} armedLabel="Replace current?" className={rowBtn}>
          <FilePlus2 className="h-4 w-4 text-amber-400" /> New
        </ConfirmButton>
        <ConfirmButton onConfirm={() => open(loadDemo)} armedLabel="Replace current?" className={rowBtn}>
          <Music className="h-4 w-4 text-amber-400" /> Demo song
        </ConfirmButton>
      </div>
      <button type="button" className={rowBtn} onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4 text-amber-400" /> Open project file (.json)
      </button>
      <input
        ref={fileRef}
        id="project-file"
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      <p className="text-[11px] text-stone-500">Replacing the current project can be undone with ↶. Your work also autosaves on this device.</p>
      {msg && <p className="text-sm text-stone-300" role="status">{msg}</p>}
    </div>
  );
}

function SongTab() {
  const swing = useStudio((s) => s.swing ?? 0);
  const setSwing = useStudio((s) => s.setSwing);
  const root = useStudio((s) => s.scaleRoot ?? 0);
  const type = useStudio((s) => s.scaleType ?? 'chromatic');
  const setScale = useStudio((s) => s.setScale);
  const bars = useStudio((s) => s.totalBars);
  const duplicateLoop = useStudio((s) => s.duplicateLoop);
  const scaleLock = useUi((s) => s.scaleLock);
  const setScaleLock = useUi((s) => s.setScaleLock);

  return (
    <div className="space-y-4">
      <div>
        <span className="text-sm text-stone-400">Key & scale</span>
        <div className="mt-1 flex gap-2">
          <select
            id="scale-root"
            aria-label="Key"
            value={root}
            onChange={(e) => setScale(Number(e.target.value), type)}
            className="h-10 rounded-lg bg-stone-950 px-2 text-sm ring-1 ring-stone-700"
          >
            {ROOT_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
          <select
            id="scale-type"
            aria-label="Scale"
            value={type}
            onChange={(e) => setScale(root, e.target.value as ScaleType)}
            className="h-10 flex-1 rounded-lg bg-stone-950 px-2 text-sm ring-1 ring-stone-700"
          >
            {(Object.keys(SCALES) as ScaleType[]).map((k) => (
              <option key={k} value={k}>
                {SCALES[k].label}
              </option>
            ))}
          </select>
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-stone-300">
          <input id="scale-lock" type="checkbox" checked={scaleLock} onChange={(e) => setScaleLock(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          Snap new and moved notes to the scale
        </label>
        <p className="mt-1 text-[11px] text-stone-500">In-key rows are lit in the piano roll; chord stamps follow the key.</p>
      </div>

      <label className="block text-sm">
        <span className="flex justify-between text-stone-400">
          Swing <span className="tabular-nums">{Math.round(swing * 100)}%</span>
        </span>
        <input id="swing" type="range" className="w-full" min={0} max={1} step={0.05} value={swing} onChange={(e) => setSwing(Number(e.target.value))} />
      </label>

      <button type="button" className={rowBtn} disabled={bars * 2 > MAX_BARS} onClick={() => duplicateLoop()}>
        <CopyPlus className="h-4 w-4 text-amber-400" /> Duplicate loop ({bars} → {bars * 2} bars)
      </button>
    </div>
  );
}

function TrackTab() {
  const id = useStudio((s) => s.activeTrackId);
  const track = useStudio((s) => s.tracks[s.activeTrackId]);
  const transpose = useStudio((s) => s.transposeTrack);
  const updateTrack = useStudio((s) => s.updateTrack);
  const clearTrack = useStudio((s) => s.clearTrack);
  const [msg, setMsg] = useState<string | null>(null);
  const meta = INSTRUMENTS[id];

  const shift = (n: number) => {
    setMsg(transpose(id, n) ? null : `Some notes would leave the ${meta.name.toLowerCase()}’s range.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
        {meta.name} <span className="font-normal text-stone-500">· {track.notes.length} notes</span>
      </div>
      {id !== 'cajon' && (
        <div>
          <span className="text-sm text-stone-400">Transpose</span>
          <div className="mt-1 flex gap-2">
            {[-12, -1, 1, 12].map((n) => (
              <button key={n} type="button" className={`${chip} flex-1`} disabled={!track.notes.length} onClick={() => shift(n)}>
                {n > 0 ? '+' : ''}
                {Math.abs(n) === 12 ? `${n > 0 ? '' : '−'}oct` : n}
              </button>
            ))}
          </div>
        </div>
      )}
      {id === 'bass' && (
        <div>
          <span className="text-sm text-stone-400">Articulation</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(['arco', 'pizz'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => updateTrack('bass', { articulation: a })}
                className={`h-10 rounded-lg text-sm font-semibold ${
                  (track.articulation ?? 'arco') === a ? 'bg-sky-400 text-stone-950' : 'bg-stone-800 text-stone-300'
                }`}
              >
                {a === 'arco' ? 'Arco (bowed)' : 'Pizzicato'}
              </button>
            ))}
          </div>
        </div>
      )}
      {id === 'piano' && (
        <label className="flex items-center gap-2 text-sm text-stone-300">
          <input
            id="piano-pedal"
            type="checkbox"
            checked={!!track.sustain}
            onChange={(e) => updateTrack('piano', { sustain: e.target.checked })}
            className="h-4 w-4 accent-amber-500"
          />
          Sustain pedal (re-pedals on every bar line)
        </label>
      )}
      <ConfirmButton onConfirm={() => clearTrack(id)} armedLabel="Tap again to clear" className={rowBtn}>
        <Trash2 className="h-4 w-4 text-rose-400" /> Clear all {meta.short} notes
      </ConfirmButton>
      {msg && <p className="text-sm text-amber-300" role="status">{msg}</p>}
    </div>
  );
}

const SAMPLE_LABELS: Record<string, string> = { piano: 'Grand piano', violin: 'Violin & viola', bass: 'Contrabass' };

function statusText(s: SampleStatus) {
  return s === 'ready' ? 'Sampled' : s === 'loading' ? 'Loading…' : s === 'fallback' ? 'Synth (samples failed)' : 'Synth';
}

function SettingsTab() {
  const velocity = useUi((s) => s.velocity);
  const setVelocity = useUi((s) => s.setVelocity);
  const rowHeight = useUi((s) => s.rowHeight);
  const zoomY = useUi((s) => s.zoomY);
  const zoomX = useUi((s) => s.zoomX);
  const samples = useTransport((s) => s.samples);
  const anyFailed = Object.values(samples).includes('fallback');

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="flex justify-between text-stone-400">
          New note velocity <span className="tabular-nums">{Math.round(velocity * 100)}%</span>
        </span>
        <input id="new-velocity" type="range" className="w-full" min={0.05} max={1} step={0.05} value={velocity} onChange={(e) => setVelocity(Number(e.target.value))} />
      </label>
      <div className="flex items-center justify-between text-sm text-stone-400">
        Zoom
        <div className="flex items-center gap-1">
          <button type="button" className={chip} onClick={() => (zoomX(1 / 1.25), zoomY(1 / 1.12))} aria-label="Zoom out">−</button>
          <span className="w-14 text-center text-xs tabular-nums">{rowHeight}px rows</span>
          <button type="button" className={chip} onClick={() => (zoomX(1.25), zoomY(1.12))} aria-label="Zoom in">+</button>
        </div>
      </div>

      <div className="rounded-xl bg-stone-950 p-3 text-xs">
        <h4 className="mb-1 font-semibold text-stone-300">Sounds</h4>
        {Object.entries(samples).map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5 text-stone-400">
            <span>{SAMPLE_LABELS[k]}</span>
            <span className={v === 'ready' ? 'text-emerald-400' : v === 'fallback' ? 'text-amber-400' : ''}>{statusText(v)}</span>
          </div>
        ))}
        <div className="flex justify-between py-0.5 text-stone-400">
          <span>Cajón</span>
          <span>Synth</span>
        </div>
        {anyFailed && (
          <button type="button" onClick={() => engine.loadSamples()} className="mt-1 flex items-center gap-1 text-amber-400">
            <RefreshCw className="h-3.5 w-3.5" /> Retry loading samples
          </button>
        )}
      </div>

      <div className="text-[11px] leading-relaxed text-stone-500">
        <p>
          <b className="text-stone-400">Draw:</b> tap a cell to add a note, drag right to lengthen · tap a note to delete · drag a note to move · drag its right edge to
          resize.
        </p>
        <p>
          <b className="text-stone-400">Navigate:</b> two fingers scroll and pinch-zoom · drag the keyboard to scroll · tap a key to hear it · tap the ruler to set the
          start point (tap it again to clear).
        </p>
        <p className="mt-1">
          Samples: Salamander Grand Piano (Alexander Holm, CC-BY 3.0) and Philharmonia Orchestra recordings via tonejs-instruments.
        </p>
      </div>
    </div>
  );
}

export default function ProjectMenu({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('project');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'project', label: 'Project' },
    { id: 'song', label: 'Song' },
    { id: 'track', label: 'Track' },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <Dialog title="Studio" onClose={onClose}>
      <div role="tablist" className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-stone-950 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-8 rounded-lg text-xs font-semibold ${tab === t.id ? 'bg-stone-700 text-stone-100' : 'text-stone-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'project' && <ProjectTab onClose={onClose} />}
      {tab === 'song' && <SongTab />}
      {tab === 'track' && <TrackTab />}
      {tab === 'settings' && <SettingsTab />}
    </Dialog>
  );
}
