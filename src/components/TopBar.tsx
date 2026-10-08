import { useEffect, useState } from 'react';
import {
  ChartNoAxesColumn,
  Download,
  Ghost,
  Hand,
  Magnet,
  Metronome,
  Minus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Redo2,
  SlidersHorizontal,
  Square,
  Undo2,
} from 'lucide-react';
import { useStudio, useUi, type NoteLength } from '../store';
import { engine, useTransport } from '../audio/engine';
import { MAX_BARS, MAX_BPM, MIN_BARS, MIN_BPM, type ChordMode } from '../lib/music';
import { Divider, IconButton, RepeatButton } from './ui';

const CHORDS: { value: ChordMode; label: string }[] = [
  { value: 'single', label: 'Note' },
  { value: 'triad', label: 'Triad' },
  { value: 'seventh', label: '7th' },
  { value: 'octave', label: 'Oct' },
];

const LENGTHS: { value: NoteLength; label: string }[] = [
  { value: 1, label: '1/16' },
  { value: 2, label: '1/8' },
  { value: 4, label: '1/4' },
  { value: 8, label: '1/2' },
  { value: 16, label: '1 bar' },
];

function BpmField() {
  const bpm = useStudio((s) => s.bpm);
  const setBpm = useStudio((s) => s.setBpm);
  const [draft, setDraft] = useState(String(bpm));
  useEffect(() => setDraft(String(bpm)), [bpm]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) setBpm(n);
    else setDraft(String(bpm));
  };
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-stone-900 ring-1 ring-stone-800">
      <RepeatButton label="Slower" onStep={() => setBpm(useStudio.getState().bpm - 1)}>
        <Minus className="h-4 w-4" />
      </RepeatButton>
      <label className="flex flex-col items-center leading-none">
        <input
          aria-label="Tempo (BPM)"
          className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums text-stone-100 outline-none"
          inputMode="numeric"
          type="text"
          value={draft}
          min={MIN_BPM}
          max={MAX_BPM}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="text-[9px] uppercase tracking-wider text-stone-500">bpm</span>
      </label>
      <RepeatButton label="Faster" onStep={() => setBpm(useStudio.getState().bpm + 1)}>
        <Plus className="h-4 w-4" />
      </RepeatButton>
    </div>
  );
}

function BarsField() {
  const bars = useStudio((s) => s.totalBars);
  const setBars = useStudio((s) => s.setTotalBars);
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-stone-900 ring-1 ring-stone-800">
      <IconButton label="Fewer bars" disabled={bars <= MIN_BARS} onClick={() => setBars(bars - 1)} className="!min-w-8 !px-1">
        <Minus className="h-4 w-4" />
      </IconButton>
      <div className="flex w-8 flex-col items-center leading-none">
        <span className="text-sm font-semibold tabular-nums">{bars}</span>
        <span className="text-[9px] uppercase tracking-wider text-stone-500">bars</span>
      </div>
      <IconButton label="More bars" disabled={bars >= MAX_BARS} onClick={() => setBars(bars + 1)} className="!min-w-8 !px-1">
        <Plus className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

export default function TopBar({ onExport, onMenu }: { onExport: () => void; onMenu: () => void }) {
  const playing = useTransport((s) => s.playing);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const ghost = useStudio((s) => s.showGhostNotes);
  const toggleGhost = useStudio((s) => s.toggleGhostNotes);
  const activeTrack = useStudio((s) => s.activeTrackId);
  const scaleType = useStudio((s) => s.scaleType ?? 'chromatic');
  const {
    tool,
    setTool,
    noteLength,
    setNoteLength,
    mixerOpen,
    setMixerOpen,
    chordMode,
    setChordMode,
    scaleLock,
    setScaleLock,
    velocityLane,
    setVelocityLane,
    metronome,
    setMetronome,
  } = useUi();
  const selectCls =
    'h-9 shrink-0 rounded-lg bg-stone-900 px-2 text-sm font-medium text-stone-200 ring-1 ring-stone-800 outline-none disabled:opacity-40';

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-stone-800 bg-stone-950 px-2">
      <button
        type="button"
        onClick={() => engine.toggle()}
        aria-label={playing ? 'Stop' : 'Play'}
        title={playing ? 'Stop (Space)' : 'Play (Space)'}
        className={`flex h-9 w-12 shrink-0 items-center justify-center rounded-lg font-semibold active:scale-95 ${
          playing ? 'bg-stone-100 text-stone-950' : 'bg-amber-500 text-stone-950'
        }`}
      >
        {playing ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
      </button>
      {/* Middle tools scroll sideways on narrow phones; play and the right-hand menus stay put. */}
      <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <IconButton label="Metronome" active={metronome} onClick={() => setMetronome(!metronome)}>
          <Metronome className="h-5 w-5" />
        </IconButton>
        <BpmField />
        <BarsField />
        <Divider />
        <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 className="h-5 w-5" />
        </IconButton>
        <Divider />
        <IconButton label={tool === 'draw' ? 'Draw tool (tap for pan)' : 'Pan tool (tap for draw)'} active={tool === 'pan'} onClick={() => setTool(tool === 'draw' ? 'pan' : 'draw')}>
          {tool === 'draw' ? <Pencil className="h-5 w-5" /> : <Hand className="h-5 w-5" />}
        </IconButton>
        <select
          aria-label="New note length"
          value={noteLength}
          disabled={activeTrack === 'cajon'}
          onChange={(e) => setNoteLength(Number(e.target.value) as NoteLength)}
          className={selectCls}
        >
          {LENGTHS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Chord stamp"
          value={chordMode}
          disabled={activeTrack === 'cajon'}
          onChange={(e) => setChordMode(e.target.value as ChordMode)}
          className={`${selectCls} ${chordMode !== 'single' ? '!ring-amber-500/60 !text-amber-300' : ''}`}
        >
          {CHORDS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <IconButton
          label={scaleType === 'chromatic' ? 'Snap to scale (pick a key in Studio → Song)' : 'Snap to scale'}
          active={scaleLock && scaleType !== 'chromatic'}
          disabled={activeTrack === 'cajon'}
          onClick={() => setScaleLock(!scaleLock)}
        >
          <Magnet className="h-5 w-5" />
        </IconButton>
        <IconButton label="Ghost notes" active={ghost} onClick={toggleGhost}>
          <Ghost className="h-5 w-5" />
        </IconButton>
        <IconButton label="Velocity lane" active={velocityLane} onClick={() => setVelocityLane(!velocityLane)}>
          <ChartNoAxesColumn className="h-5 w-5" />
        </IconButton>
      </div>
      <div className="h-6 w-px shrink-0 bg-stone-800" />
      <IconButton label="Mixer" active={mixerOpen} onClick={() => setMixerOpen(!mixerOpen)}>
        <SlidersHorizontal className="h-5 w-5" />
      </IconButton>
      <IconButton label="Export" onClick={onExport}>
        <Download className="h-5 w-5" />
      </IconButton>
      <IconButton label="Studio menu" onClick={onMenu}>
        <MoreHorizontal className="h-5 w-5" />
      </IconButton>
    </header>
  );
}
