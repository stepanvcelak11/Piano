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
