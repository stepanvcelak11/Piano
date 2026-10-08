import { useEffect, useState } from 'react';
import {
  Download,
  Ghost,
  Hand,
  Minus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Redo2,
  SlidersHorizontal,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useStudio, useUi, type NoteLength } from '../store';
import { engine, useTransport } from '../audio/engine';
import { MAX_BARS, MAX_BPM, MIN_BARS, MIN_BPM } from '../lib/music';
import { Divider, IconButton, RepeatButton } from './ui';

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
  const { tool, setTool, noteLength, setNoteLength, zoomX, zoomY, mixerOpen, setMixerOpen } = useUi();

  return (
    <header className="scrollbar-none flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-800 bg-stone-950 px-2">
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
        className="h-9 shrink-0 rounded-lg bg-stone-900 px-2 text-sm font-medium text-stone-200 ring-1 ring-stone-800 outline-none disabled:opacity-40"
      >
        {LENGTHS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <IconButton label="Ghost notes" active={ghost} onClick={toggleGhost}>
        <Ghost className="h-5 w-5" />
      </IconButton>
      <IconButton label="Zoom out" onClick={() => (zoomX(1 / 1.25), zoomY(1 / 1.12))}>
        <ZoomOut className="h-5 w-5" />
      </IconButton>
      <IconButton label="Zoom in" onClick={() => (zoomX(1.25), zoomY(1.12))}>
        <ZoomIn className="h-5 w-5" />
      </IconButton>
      <div className="flex-1" />
      <IconButton label="Mixer" active={mixerOpen} onClick={() => setMixerOpen(!mixerOpen)}>
        <SlidersHorizontal className="h-5 w-5" />
      </IconButton>
      <IconButton label="Export WAV" onClick={onExport}>
        <Download className="h-5 w-5" />
      </IconButton>
      <IconButton label="Project menu" onClick={onMenu}>
        <MoreHorizontal className="h-5 w-5" />
      </IconButton>
    </header>
  );
}
