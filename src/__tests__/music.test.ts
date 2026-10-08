import { describe, expect, it } from 'vitest';
import { effectiveDuration, isAudible, isBlackKey, midiToPitch, pitchToMidi, rowsFor } from '../lib/music';
import { demoProject, emptyTracks } from '../lib/demo';
import { indexNotesByStep } from '../audio/engine';
import { sanitizeProject } from '../store';

describe('pitch helpers', () => {
  it('round-trips MIDI and pitch names', () => {
    for (let m = 21; m <= 108; m++) expect(pitchToMidi(midiToPitch(m))).toBe(m);
    expect(midiToPitch(60)).toBe('C4');
    expect(pitchToMidi('Bb2')).toBe(46);
    expect(pitchToMidi('SLAP')).toBeNull();
  });
  it('detects black keys', () => {
    expect(isBlackKey('F#3')).toBe(true);
    expect(isBlackKey('E3')).toBe(false);
    expect(isBlackKey('BASS')).toBe(false);
  });
  it('orders rows high → low and cajon bass at the bottom', () => {
    const piano = rowsFor('piano');
    expect(piano[0]).toBe('C8');
    expect(piano[piano.length - 1]).toBe('A0');
    expect(piano).toHaveLength(88);
    expect(rowsFor('cajon')).toEqual(['SIDE', 'TIP', 'SLAP', 'BASS']);
  });
});

describe('playback rules', () => {
  it('applies mute and solo', () => {
    const t = emptyTracks();
    expect(isAudible(t.piano, false)).toBe(true);
    expect(isAudible({ ...t.piano, muted: true }, false)).toBe(false);
    expect(isAudible(t.piano, true)).toBe(false);
    expect(isAudible({ ...t.piano, solo: true }, true)).toBe(true);
  });
  it('extends piano notes to the bar line with sustain pedal', () => {
    const t = emptyTracks();
    const note = { id: 'n', pitch: 'C4', time: 18, duration: 2 };
    expect(effectiveDuration(note, { ...t.piano, sustain: false })).toBe(2);
    expect(effectiveDuration(note, { ...t.piano, sustain: true })).toBe(14);
    expect(effectiveDuration(note, t.violin)).toBe(2);
  });
  it('indexes notes by step and skips notes past the song end', () => {
    const p = demoProject();
    const idx = indexNotesByStep(p.tracks, 16);
    for (const step of idx.keys()) expect(step).toBeLessThan(16);
    expect(idx.get(0)?.some((n) => n.trackId === 'cajon' && n.note.pitch === 'BASS')).toBe(true);
  });
});

describe('demo + persistence', () => {
  it('demo notes fit their instrument ranges', () => {
    const p = demoProject();
    for (const [id, track] of Object.entries(p.tracks)) {
      const rows = new Set(rowsFor(id as keyof typeof p.tracks));
      for (const n of track.notes) expect(rows.has(n.pitch), `${id} ${n.pitch}`).toBe(true);
    }
  });
  it('repairs corrupt persisted state', () => {
    const fixed = sanitizeProject({ bpm: 9999, totalBars: -2, activeTrackId: 'kazoo', tracks: { piano: { volume: 99, notes: [{ bad: true }] } } });
    expect(fixed.bpm).toBe(240);
    expect(fixed.totalBars).toBe(1);
    expect(fixed.activeTrackId).toBe('piano');
    expect(fixed.tracks.piano.volume).toBe(6);
    expect(fixed.tracks.piano.notes).toEqual([]);
    expect(fixed.tracks.cajon.notes).toEqual([]);
  });
});

import { chordFrom, inScale, snapToScale } from '../lib/music';
import { projectToMidi } from '../lib/midi';

describe('scales & chords', () => {
  it('knows A minor', () => {
    expect(inScale(57, 9, 'minor')).toBe(true); // A3
    expect(inScale(58, 9, 'minor')).toBe(false); // A#3
    expect(snapToScale(58, 9, 'minor')).toBe(59); // → B3 (tie resolves up)
  });
  it('builds diatonic triads and sevenths', () => {
    expect(chordFrom(57, 'triad', 9, 'minor')).toEqual([57, 60, 64]); // Am
    expect(chordFrom(53, 'triad', 9, 'minor')).toEqual([53, 57, 60]); // F
    expect(chordFrom(55, 'seventh', 9, 'minor')).toEqual([55, 59, 62, 65]); // G7
    expect(chordFrom(60, 'triad', 0, 'chromatic')).toEqual([60, 64, 67]);
    expect(chordFrom(60, 'octave', 0, 'major')).toEqual([60, 72]);
  });
});

describe('MIDI export', () => {
  it('writes a valid format-1 header with one chunk per track', () => {
    const bytes = projectToMidi(demoProject());
    const text = String.fromCharCode(...bytes.slice(0, 4));
    expect(text).toBe('MThd');
    const ntrks = (bytes[10] << 8) | bytes[11];
    expect(ntrks).toBe(6); // tempo + 5 instruments
    const count = (needle: string) => {
      let c = 0;
      for (let i = 0; i < bytes.length - 3; i++) if (String.fromCharCode(...bytes.slice(i, i + 4)) === needle) c++;
      return c;
    };
    expect(count('MTrk')).toBe(6);
  });
});
