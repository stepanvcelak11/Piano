import { beforeEach, describe, expect, it } from 'vitest';
import { useStudio } from '../store';
import { demoProject } from '../lib/demo';

beforeEach(() => {
  useStudio.setState({ ...demoProject(), past: [], future: [] });
});

describe('studio store', () => {
  it('transposes a track and refuses to leave the instrument range', () => {
    const s = useStudio.getState();
    const first = s.tracks.violin.notes[0].pitch;
    expect(s.transposeTrack('violin', 2)).toBe(true);
    expect(useStudio.getState().tracks.violin.notes[0].pitch).not.toBe(first);
    expect(useStudio.getState().transposeTrack('bass', -24)).toBe(false); // below E1
    useStudio.getState().undo();
    expect(useStudio.getState().tracks.violin.notes[0].pitch).toBe(first);
  });

  it('duplicates the loop', () => {
    const before = useStudio.getState().tracks.cajon.notes.length;
    expect(useStudio.getState().duplicateLoop()).toBe(true);
    const s = useStudio.getState();
    expect(s.totalBars).toBe(8);
    expect(s.tracks.cajon.notes.length).toBe(before * 2);
    expect(new Set(s.tracks.cajon.notes.map((n) => n.id)).size).toBe(before * 2);
  });

  it('undoes and redoes note edits as one step per checkpoint', () => {
    const s = useStudio.getState();
    s.checkpoint();
    s.addNotes('piano', [
      { id: 'a', pitch: 'C4', time: 0, duration: 1 },
      { id: 'b', pitch: 'E4', time: 0, duration: 1 },
    ]);
    s.updateNotes('piano', ['a', 'b'], { duration: 4 });
    const count = useStudio.getState().tracks.piano.notes.length;
    useStudio.getState().undo();
    expect(useStudio.getState().tracks.piano.notes.length).toBe(count - 2);
    useStudio.getState().redo();
    expect(useStudio.getState().tracks.piano.notes.filter((n) => n.duration === 4 && n.time === 0).length).toBeGreaterThanOrEqual(2);
  });

  it('imports a project file and repairs it', () => {
    useStudio.getState().loadProject({ bpm: 120, totalBars: 2, tracks: { piano: { notes: [{ id: 'x', pitch: 'C4', time: 1, duration: 2 }] } } });
    const s = useStudio.getState();
    expect(s.bpm).toBe(120);
    expect(s.tracks.piano.notes).toHaveLength(1);
    expect(s.tracks.violin.notes).toHaveLength(0);
  });
});
