import type { InstrumentId, NoteEvent, ProjectState, Track } from '../types';
import { makeId } from './music';

function n(pitch: string, time: number, duration = 1, velocity = 0.8): NoteEvent {
  return { id: makeId(), pitch, time, duration, velocity };
}

function track(id: InstrumentId, name: string, extra: Partial<Track> = {}): Track {
  return { id, name, muted: false, solo: false, volume: -6, reverbSend: 0.25, notes: [], ...extra };
}

export function emptyTracks(): Record<InstrumentId, Track> {
  return {
    piano: track('piano', 'Piano', { sustain: true, volume: -4, reverbSend: 0.3 }),
    violin: track('violin', 'Violin', { volume: -8, reverbSend: 0.35 }),
    viola: track('viola', 'Viola', { volume: -10, reverbSend: 0.35 }),
    bass: track('bass', 'Bass', { volume: -6, reverbSend: 0.12, articulation: 'arco' }),
    cajon: track('cajon', 'Cajon', { volume: -6, reverbSend: 0.1 }),
  };
}

export function emptyProject(): ProjectState {
  return {
    name: 'Untitled',
    bpm: 92,
    totalBars: 4,
    activeTrackId: 'piano',
    showGhostNotes: true,
    swing: 0,
    scaleRoot: 0,
    scaleType: 'chromatic',
    tracks: emptyTracks(),
  };
}

/** A short Am – F – C – G crossover groove so the studio isn't silent on first launch. */
export function demoProject(): ProjectState {
  const p = emptyProject();
  p.name = 'Demo – A minor groove';
  p.scaleRoot = 9;
  p.scaleType = 'minor';
  p.swing = 0.15;
  p.tracks.bass.articulation = 'pizz';
  const chords: string[][] = [
    ['A3', 'C4', 'E4'],
    ['F3', 'A3', 'C4'],
    ['G3', 'C4', 'E4'],
    ['G3', 'B3', 'D4'],
  ];
  const roots = ['A1', 'F1', 'C2', 'G1'];
  const leftHand = ['A2', 'F2', 'C3', 'G2'];
  chords.forEach((chord, bar) => {
    const t = bar * 16;
    // Broken-chord piano figure in eighths.
    const pattern = [chord[0], chord[1], chord[2], chord[1]];
    for (let i = 0; i < 8; i++) p.tracks.piano.notes.push(n(pattern[i % 4], t + i * 2, 2, i % 4 === 0 ? 0.85 : 0.65));
    p.tracks.piano.notes.push(n(leftHand[bar], t, 16, 0.7));
    // Bass on beats 1 and 3.
    p.tracks.bass.notes.push(n(roots[bar], t, 6, 0.9));
    p.tracks.bass.notes.push(n(roots[bar], t + 8, 6, 0.75));
    // Viola pads on the chord's middle voice.
    p.tracks.viola.notes.push(n(chord[1], t, 16, 0.55));
    // Cajon: bass on 1 & the "and" of 2, slaps on 2 & 4, tips on off-beats.
    [0, 6, 10].forEach((s) => p.tracks.cajon.notes.push(n('BASS', t + s, 1, 0.95)));
    [4, 12].forEach((s) => p.tracks.cajon.notes.push(n('SLAP', t + s, 1, 0.9)));
    [2, 7, 14, 15].forEach((s) => p.tracks.cajon.notes.push(n('TIP', t + s, 1, 0.5)));
  });
  // Violin melody.
  const melody: [string, number, number][] = [
    ['E5', 0, 6], ['D5', 6, 2], ['C5', 8, 4], ['B4', 12, 4],
    ['C5', 16, 6], ['A4', 22, 2], ['C5', 24, 4], ['F5', 28, 4],
    ['E5', 32, 8], ['G5', 40, 4], ['E5', 44, 4],
    ['D5', 48, 6], ['B4', 54, 2], ['D5', 56, 8],
  ];
  melody.forEach(([pitch, t, d]) => p.tracks.violin.notes.push(n(pitch, t, d, 0.75)));
  return p;
}
