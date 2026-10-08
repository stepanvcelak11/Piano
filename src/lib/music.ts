import type { CajonHit, InstrumentId, NoteEvent, ScaleType, Track } from '../types';

export const STEPS_PER_BAR = 16;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const MIN_BARS = 1;
export const MAX_BARS = 16;
export const MIN_VOLUME_DB = -60;
export const MAX_VOLUME_DB = 6;
export const DEFAULT_VELOCITY = 0.8;

export const INSTRUMENT_ORDER: InstrumentId[] = ['piano', 'violin', 'viola', 'bass', 'cajon'];

export const CAJON_HITS: CajonHit[] = ['BASS', 'SLAP', 'TIP', 'SIDE'];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Convert a MIDI number to scientific pitch notation using sharps (60 → 'C4'). */
export function midiToPitch(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** Parse 'C4', 'F#3', 'Bb2' → MIDI number; returns null for non-pitched values. */
export function pitchToMidi(pitch: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(pitch);
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semis = base[m[1].toUpperCase()];
  if (m[2] === '#') semis += 1;
  if (m[2] === 'b') semis -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + semis;
}

export function isBlackKey(pitch: string): boolean {
  const midi = pitchToMidi(pitch);
  if (midi === null) return false;
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export interface InstrumentMeta {
  id: InstrumentId;
  name: string;
  short: string;
  /** Lowest / highest MIDI note playable (inclusive). Ignored for cajon. */
  range: [number, number];
  /** MIDI note to centre the piano roll on when first opened. */
  focus: number;
  color: string; // note fill colour
}

export const INSTRUMENTS: Record<InstrumentId, InstrumentMeta> = {
  piano: { id: 'piano', name: 'Grand Piano', short: 'Piano', range: [21, 108], focus: 64, color: '#f59e0b' },
  violin: { id: 'violin', name: 'Violin', short: 'Violin', range: [55, 100], focus: 76, color: '#f43f5e' },
  viola: { id: 'viola', name: 'Viola', short: 'Viola', range: [48, 88], focus: 64, color: '#a855f7' },
  bass: { id: 'bass', name: 'Upright Bass', short: 'Bass', range: [28, 67], focus: 40, color: '#38bdf8' },
  cajon: { id: 'cajon', name: 'Cajón', short: 'Cajón', range: [0, 0], focus: 0, color: '#84cc16' },
};

/** Rows of the piano roll for an instrument, top row first (highest pitch first). */
export function rowsFor(id: InstrumentId): string[] {
  if (id === 'cajon') return [...CAJON_HITS].reverse(); // SIDE, TIP, SLAP, BASS (bass at bottom)
  const [lo, hi] = INSTRUMENTS[id].range;
  const rows: string[] = [];
  for (let m = hi; m >= lo; m--) rows.push(midiToPitch(m));
  return rows;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

let idCounter = 0;
export function makeId(): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Is the track audible given the global solo state? */
export function isAudible(track: Track, anySolo: boolean): boolean {
  if (track.muted) return false;
  return anySolo ? track.solo : true;
}

/**
 * Effective note length in steps. With the piano sustain pedal on, the pedal is
 * "re-pedalled" on every bar line, so each note rings until the end of its bar.
 */
export function effectiveDuration(note: NoteEvent, track: Track): number {
  if (track.id === 'piano' && track.sustain) {
    const barEnd = (Math.floor(note.time / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
    return Math.max(note.duration, barEnd - note.time);
  }
  return note.duration;
}

/** Does a note overlap the given cell (same pitch)? */
export function noteCovers(note: NoteEvent, pitch: string, step: number): boolean {
  return note.pitch === pitch && step >= note.time && step < note.time + note.duration;
}

// ---------------------------------------------------------------------------
// Scales & chords
// ---------------------------------------------------------------------------


export const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES: Record<ScaleType, { label: string; steps: number[] }> = {
  chromatic: { label: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  pentatonic: { label: 'Pentatonic', steps: [0, 2, 4, 7, 9] },
};

export function inScale(midi: number, root: number, type: ScaleType): boolean {
  return SCALES[type].steps.includes((((midi - root) % 12) + 12) % 12);
}

/** Nearest in-scale MIDI note (ties resolve upward). */
export function snapToScale(midi: number, root: number, type: ScaleType): number {
  for (let d = 0; d <= 6; d++) {
    if (inScale(midi + d, root, type)) return midi + d;
    if (inScale(midi - d, root, type)) return midi - d;
  }
  return midi;
}

export type ChordMode = 'single' | 'triad' | 'seventh' | 'octave';

/**
 * Notes of a chord built on `midi`: diatonic stacked thirds in the current scale,
 * or a major (7th) chord when the scale is chromatic / pentatonic.
 */
export function chordFrom(midi: number, mode: ChordMode, root: number, type: ScaleType): number[] {
  if (mode === 'single') return [midi];
  if (mode === 'octave') return [midi, midi + 12];
  const size = mode === 'triad' ? 3 : 4;
  if (type === 'chromatic' || type === 'pentatonic') return [0, 4, 7, 11].slice(0, size).map((i) => midi + i);
  const base = snapToScale(midi, root, type);
  const steps = SCALES[type].steps;
  const rel = (((base - root) % 12) + 12) % 12;
  const degree = steps.indexOf(rel);
  const out: number[] = [];
  for (let k = 0; k < size; k++) {
    const idx = degree + k * 2;
    const octave = Math.floor(idx / steps.length);
    out.push(base - rel + steps[idx % steps.length] + octave * 12);
  }
  return out;
}
