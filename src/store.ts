import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { InstrumentId, NoteEvent, ProjectState, Track } from './types';
import { demoProject, emptyProject, emptyTracks } from './lib/demo';
import {
  clamp,
  INSTRUMENT_ORDER,
  MAX_BARS,
  MAX_BPM,
  MAX_VOLUME_DB,
  MIN_BARS,
  MIN_BPM,
  MIN_VOLUME_DB,
} from './lib/music';

type Snapshot = Pick<ProjectState, 'bpm' | 'totalBars' | 'tracks'>;
type TrackSettings = Partial<Pick<Track, 'muted' | 'solo' | 'volume' | 'reverbSend' | 'sustain'>>;

const HISTORY_LIMIT = 60;

export interface StudioState extends ProjectState {
  past: Snapshot[];
  future: Snapshot[];

  /** Snapshot the current project so the next edit(s) can be undone as one step. */
  checkpoint: () => void;
  /** Restore the last checkpoint without making it redoable (cancelled gesture). */
  revert: () => void;
  /** Discard the last checkpoint (gesture turned out to change nothing). */
  dropCheckpoint: () => void;
  undo: () => void;
  redo: () => void;

  setBpm: (bpm: number) => void;
  setTotalBars: (bars: number) => void;
  setActiveTrack: (id: InstrumentId) => void;
  toggleGhostNotes: () => void;

  addNote: (trackId: InstrumentId, note: NoteEvent) => void;
  updateNote: (trackId: InstrumentId, noteId: string, patch: Partial<Omit<NoteEvent, 'id'>>) => void;
  removeNote: (trackId: InstrumentId, noteId: string) => void;
  clearTrack: (trackId: InstrumentId) => void;

  updateTrack: (trackId: InstrumentId, patch: TrackSettings) => void;

  newProject: () => void;
  loadDemo: () => void;
}

function snapshot(s: ProjectState): Snapshot {
  return { bpm: s.bpm, totalBars: s.totalBars, tracks: s.tracks };
}

function mapTrack(
  tracks: Record<InstrumentId, Track>,
  id: InstrumentId,
  fn: (t: Track) => Track,
): Record<InstrumentId, Track> {
  return { ...tracks, [id]: fn(tracks[id]) };
}

/** Validate / repair persisted data so a corrupt or older save never crashes the app. */
export function sanitizeProject(raw: unknown): ProjectState {
  const base = demoProject();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProjectState>;
  const defaults = emptyTracks();
  const tracks = {} as Record<InstrumentId, Track>;
  for (const id of INSTRUMENT_ORDER) {
    const t = (r.tracks as Record<string, Partial<Track>> | undefined)?.[id];
    const d = defaults[id];
    tracks[id] = {
      ...d,
      ...(t && typeof t === 'object' ? t : {}),
      id,
      volume: clamp(Number(t?.volume ?? d.volume) || 0, MIN_VOLUME_DB, MAX_VOLUME_DB),
      reverbSend: clamp(Number(t?.reverbSend ?? d.reverbSend) || 0, 0, 1),
      notes: Array.isArray(t?.notes)
        ? t!.notes.filter(
            (n): n is NoteEvent =>
              !!n &&
              typeof n.id === 'string' &&
              typeof n.pitch === 'string' &&
              Number.isFinite(n.time) &&
              Number.isFinite(n.duration) &&
              n.duration > 0,
          )
        : [],
    };
  }
  return {
    bpm: clamp(Math.round(Number(r.bpm) || base.bpm), MIN_BPM, MAX_BPM),
    totalBars: clamp(Math.round(Number(r.totalBars) || base.totalBars), MIN_BARS, MAX_BARS),
    activeTrackId: INSTRUMENT_ORDER.includes(r.activeTrackId as InstrumentId)
      ? (r.activeTrackId as InstrumentId)
      : 'piano',
    showGhostNotes: r.showGhostNotes ?? true,
    tracks,
  };
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      ...demoProject(),
      past: [],
      future: [],

      checkpoint: () =>
        set((s) => ({ past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT), future: [] })),
      revert: () => {
        const s = get();
        const prev = s.past[s.past.length - 1];
        if (prev) set({ ...prev, past: s.past.slice(0, -1) });
      },
      dropCheckpoint: () => set((s) => ({ past: s.past.slice(0, -1) })),
      undo: () => {
        const s = get();
        const prev = s.past[s.past.length - 1];
        if (!prev) return;
        set({ ...prev, past: s.past.slice(0, -1), future: [snapshot(s), ...s.future] });
      },
      redo: () => {
        const s = get();
        const next = s.future[0];
        if (!next) return;
        set({ ...next, past: [...s.past, snapshot(s)], future: s.future.slice(1) });
      },

      setBpm: (bpm) => set({ bpm: clamp(Math.round(bpm), MIN_BPM, MAX_BPM) }),
      setTotalBars: (bars) => {
        get().checkpoint();
        set({ totalBars: clamp(Math.round(bars), MIN_BARS, MAX_BARS) });
      },
      setActiveTrack: (id) => set({ activeTrackId: id }),
      toggleGhostNotes: () => set((s) => ({ showGhostNotes: !s.showGhostNotes })),

      addNote: (trackId, note) =>
        set((s) => ({ tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: [...t.notes, note] })) })),
      updateNote: (trackId, noteId, patch) =>
        set((s) => ({
          tracks: mapTrack(s.tracks, trackId, (t) => ({
            ...t,
            notes: t.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
          })),
        })),
      removeNote: (trackId, noteId) =>
        set((s) => ({
          tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: t.notes.filter((n) => n.id !== noteId) })),
        })),
      clearTrack: (trackId) => {
        get().checkpoint();
        set((s) => ({ tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: [] })) }));
      },

      updateTrack: (trackId, patch) =>
        set((s) => ({
          tracks: mapTrack(s.tracks, trackId, (t) => {
            const next = { ...t, ...patch };
            next.volume = clamp(next.volume, MIN_VOLUME_DB, MAX_VOLUME_DB);
            next.reverbSend = clamp(next.reverbSend, 0, 1);
            return next;
          }),
        })),

      newProject: () => {
        get().checkpoint();
        set({ ...emptyProject(), activeTrackId: get().activeTrackId });
      },
      loadDemo: () => {
        get().checkpoint();
        set({ ...demoProject() });
      },
    }),
    {
      name: 'crossover-studio/project',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ProjectState => ({
        bpm: s.bpm,
        totalBars: s.totalBars,
        activeTrackId: s.activeTrackId,
        showGhostNotes: s.showGhostNotes,
        tracks: s.tracks,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeProject(persisted) }),
    },
  ),
);

/** UI-only preferences (not part of the project / undo history). */
export type NoteLength = 1 | 2 | 4 | 8 | 16;
export type Tool = 'draw' | 'pan';

interface UiState {
  noteLength: NoteLength;
  velocity: number;
  tool: Tool;
  stepWidth: number; // px per 16th step
  rowHeight: number; // px per pitch row
  mixerOpen: boolean;
  setNoteLength: (l: NoteLength) => void;
  setVelocity: (v: number) => void;
  setTool: (t: Tool) => void;
  zoomX: (factor: number) => void;
  zoomY: (factor: number) => void;
  setMixerOpen: (open: boolean) => void;
}

export const MIN_STEP_W = 14;
export const MAX_STEP_W = 72;
export const MIN_ROW_H = 16;
export const MAX_ROW_H = 40;

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      noteLength: 2,
      velocity: 0.8,
      tool: 'draw',
      stepWidth: 28,
      rowHeight: 22,
      mixerOpen: false,
      setNoteLength: (noteLength) => set({ noteLength }),
      setVelocity: (velocity) => set({ velocity: clamp(velocity, 0.05, 1) }),
      setTool: (tool) => set({ tool }),
      zoomX: (f) => set((s) => ({ stepWidth: clamp(Math.round(s.stepWidth * f), MIN_STEP_W, MAX_STEP_W) })),
      zoomY: (f) => set((s) => ({ rowHeight: clamp(Math.round(s.rowHeight * f), MIN_ROW_H, MAX_ROW_H) })),
      setMixerOpen: (mixerOpen) => set({ mixerOpen }),
    }),
    {
      name: 'crossover-studio/ui',
      version: 1,
      partialize: (s) => ({
        noteLength: s.noteLength,
        velocity: s.velocity,
        stepWidth: s.stepWidth,
        rowHeight: s.rowHeight,
      }),
    },
  ),
);
