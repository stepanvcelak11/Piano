import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { InstrumentId, NoteEvent, ProjectState, ScaleType, Track } from './types';
import { demoProject, emptyProject, emptyTracks } from './lib/demo';
import {
  clamp,
  INSTRUMENT_ORDER,
  INSTRUMENTS,
  makeId,
  MAX_BARS,
  MAX_BPM,
  MAX_VOLUME_DB,
  MIN_BARS,
  MIN_BPM,
  MIN_VOLUME_DB,
  midiToPitch,
  pitchToMidi,
  SCALES,
  STEPS_PER_BAR,
  type ChordMode,
} from './lib/music';

type Snapshot = Pick<ProjectState, 'bpm' | 'totalBars' | 'tracks' | 'swing'>;
type TrackSettings = Partial<Pick<Track, 'muted' | 'solo' | 'volume' | 'reverbSend' | 'sustain' | 'articulation'>>;

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
  setSwing: (swing: number) => void;
  setScale: (root: number, type: ScaleType) => void;
  setName: (name: string) => void;

  addNote: (trackId: InstrumentId, note: NoteEvent) => void;
  addNotes: (trackId: InstrumentId, notes: NoteEvent[]) => void;
  updateNote: (trackId: InstrumentId, noteId: string, patch: Partial<Omit<NoteEvent, 'id'>>) => void;
  updateNotes: (trackId: InstrumentId, ids: string[], patch: Partial<Omit<NoteEvent, 'id'>>) => void;
  removeNote: (trackId: InstrumentId, noteId: string) => void;
  clearTrack: (trackId: InstrumentId) => void;
  /** Shift every note of a track by `semitones`. Returns false (and changes nothing) if a note would leave the range. */
  transposeTrack: (trackId: InstrumentId, semitones: number) => boolean;
  /** Double the song length, copying every track's notes into the new bars. */
  duplicateLoop: () => boolean;

  updateTrack: (trackId: InstrumentId, patch: TrackSettings) => void;

  newProject: () => void;
  loadDemo: () => void;
  loadProject: (project: unknown) => void;
}

function snapshot(s: ProjectState): Snapshot {
  return { bpm: s.bpm, totalBars: s.totalBars, tracks: s.tracks, swing: s.swing };
}

export function projectOf(s: ProjectState): ProjectState {
  return {
    name: s.name,
    bpm: s.bpm,
    totalBars: s.totalBars,
    activeTrackId: s.activeTrackId,
    showGhostNotes: s.showGhostNotes,
    swing: s.swing,
    scaleRoot: s.scaleRoot,
    scaleType: s.scaleType,
    tracks: s.tracks,
  };
}

function mapTrack(
  tracks: Record<InstrumentId, Track>,
  id: InstrumentId,
  fn: (t: Track) => Track,
): Record<InstrumentId, Track> {
  return { ...tracks, [id]: fn(tracks[id]) };
}

/** Validate / repair persisted or imported data so a corrupt save never crashes the app. */
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
      name: typeof t?.name === 'string' ? t.name : d.name,
      muted: !!(t?.muted ?? d.muted),
      solo: !!(t?.solo ?? d.solo),
      volume: clamp(Number(t?.volume ?? d.volume) || 0, MIN_VOLUME_DB, MAX_VOLUME_DB),
      reverbSend: clamp(Number(t?.reverbSend ?? d.reverbSend) || 0, 0, 1),
      articulation: t?.articulation === 'pizz' ? 'pizz' : d.articulation,
      notes: Array.isArray(t?.notes)
        ? t!.notes
            .filter(
              (n): n is NoteEvent =>
                !!n &&
                typeof n.id === 'string' &&
                typeof n.pitch === 'string' &&
                Number.isFinite(n.time) &&
                Number.isFinite(n.duration) &&
                n.duration > 0 &&
                n.time >= 0,
            )
            .map((n) => ({
              id: n.id,
              pitch: n.pitch,
              time: Math.round(n.time),
              duration: Math.max(1, Math.round(n.duration)),
              velocity: clamp(Number(n.velocity ?? 0.8) || 0.8, 0.05, 1),
            }))
        : [],
    };
  }
  const scaleType = r.scaleType && r.scaleType in SCALES ? r.scaleType : 'chromatic';
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 80) : 'Untitled',
    bpm: clamp(Math.round(Number(r.bpm) || base.bpm), MIN_BPM, MAX_BPM),
    totalBars: clamp(Math.round(Number(r.totalBars) || base.totalBars), MIN_BARS, MAX_BARS),
    activeTrackId: INSTRUMENT_ORDER.includes(r.activeTrackId as InstrumentId)
      ? (r.activeTrackId as InstrumentId)
      : 'piano',
    showGhostNotes: r.showGhostNotes ?? true,
    swing: clamp(Number(r.swing) || 0, 0, 1),
    scaleRoot: clamp(Math.round(Number(r.scaleRoot) || 0), 0, 11),
    scaleType,
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
      setSwing: (swing) => set({ swing: clamp(swing, 0, 1) }),
      setScale: (scaleRoot, scaleType) => set({ scaleRoot: clamp(Math.round(scaleRoot), 0, 11), scaleType }),
      setName: (name) => set({ name: name.slice(0, 80) }),

      addNote: (trackId, note) =>
        set((s) => ({ tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: [...t.notes, note] })) })),
      addNotes: (trackId, notes) =>
        set((s) => ({ tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: [...t.notes, ...notes] })) })),
      updateNote: (trackId, noteId, patch) =>
        set((s) => ({
          tracks: mapTrack(s.tracks, trackId, (t) => ({
            ...t,
            notes: t.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
          })),
        })),
      updateNotes: (trackId, ids, patch) => {
        const set_ = new Set(ids);
        set((s) => ({
          tracks: mapTrack(s.tracks, trackId, (t) => ({
            ...t,
            notes: t.notes.map((n) => (set_.has(n.id) ? { ...n, ...patch } : n)),
          })),
        }));
      },
      removeNote: (trackId, noteId) =>
        set((s) => ({
          tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: t.notes.filter((n) => n.id !== noteId) })),
        })),
      clearTrack: (trackId) => {
        get().checkpoint();
        set((s) => ({ tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: [] })) }));
      },
      transposeTrack: (trackId, semitones) => {
        if (trackId === 'cajon') return false;
        const [lo, hi] = INSTRUMENTS[trackId].range;
        const notes = get().tracks[trackId].notes;
        const moved: NoteEvent[] = [];
        for (const n of notes) {
          const m = pitchToMidi(n.pitch);
          if (m === null) continue;
          const next = m + semitones;
          if (next < lo || next > hi) return false;
          moved.push({ ...n, pitch: midiToPitch(next) });
        }
        get().checkpoint();
        set((s) => ({ tracks: mapTrack(s.tracks, trackId, (t) => ({ ...t, notes: moved })) }));
        return true;
      },
      duplicateLoop: () => {
        const s = get();
        if (s.totalBars * 2 > MAX_BARS) return false;
        const steps = s.totalBars * STEPS_PER_BAR;
        s.checkpoint();
        const tracks = { ...s.tracks };
        for (const id of INSTRUMENT_ORDER) {
          const inLoop = s.tracks[id].notes.filter((n) => n.time < steps);
          const copies = inLoop.map((n) => ({ ...n, id: makeId(), time: n.time + steps }));
          tracks[id] = { ...s.tracks[id], notes: [...inLoop, ...copies] };
        }
        set({ tracks, totalBars: s.totalBars * 2 });
        return true;
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
      loadProject: (project) => {
        get().checkpoint();
        set({ ...sanitizeProject(project) });
      },
    }),
    {
      name: 'crossover-studio/project',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): ProjectState => projectOf(s),
      merge: (persisted, current) => ({ ...current, ...sanitizeProject(persisted) }),
      migrate: (persisted) => persisted as ProjectState,
    },
  ),
);

// ---------------------------------------------------------------------------
// Project library (named saves on this device)
// ---------------------------------------------------------------------------

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: number;
  data: ProjectState;
}

interface LibraryState {
  projects: SavedProject[];
  /** Save (or overwrite by name) the given project; returns its id. */
  save: (project: ProjectState) => string;
  remove: (id: string) => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      projects: [],
      save: (project) => {
        const name = project.name?.trim() || 'Untitled';
        const existing = get().projects.find((p) => p.name === name);
        const id = existing?.id ?? makeId();
        const entry: SavedProject = { id, name, updatedAt: Date.now(), data: JSON.parse(JSON.stringify(project)) };
        set((s) => ({
          projects: [entry, ...s.projects.filter((p) => p.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt),
        }));
        return id;
      },
      remove: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
    }),
    { name: 'crossover-studio/library', version: 1 },
  ),
);

// ---------------------------------------------------------------------------
// UI-only preferences (not part of the project / undo history)
// ---------------------------------------------------------------------------

export type NoteLength = 1 | 2 | 4 | 8 | 16;
export type Tool = 'draw' | 'pan';

interface UiState {
  noteLength: NoteLength;
  velocity: number;
  tool: Tool;
  stepWidth: number; // px per 16th step
  rowHeight: number; // px per pitch row
  mixerOpen: boolean;
  chordMode: ChordMode;
  scaleLock: boolean;
  velocityLane: boolean;
  metronome: boolean;
  /** Step the transport starts from (set by tapping the ruler). */
  cueStep: number;
  setNoteLength: (l: NoteLength) => void;
  setVelocity: (v: number) => void;
  setTool: (t: Tool) => void;
  zoomX: (factor: number) => void;
  zoomY: (factor: number) => void;
  setMixerOpen: (open: boolean) => void;
  setChordMode: (m: ChordMode) => void;
  setScaleLock: (on: boolean) => void;
  setVelocityLane: (on: boolean) => void;
  setMetronome: (on: boolean) => void;
  setCueStep: (step: number) => void;
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
      chordMode: 'single',
      scaleLock: false,
      velocityLane: false,
      metronome: false,
      cueStep: 0,
      setNoteLength: (noteLength) => set({ noteLength }),
      setVelocity: (velocity) => set({ velocity: clamp(velocity, 0.05, 1) }),
      setTool: (tool) => set({ tool }),
      zoomX: (f) => set((s) => ({ stepWidth: clamp(Math.round(s.stepWidth * f), MIN_STEP_W, MAX_STEP_W) })),
      zoomY: (f) => set((s) => ({ rowHeight: clamp(Math.round(s.rowHeight * f), MIN_ROW_H, MAX_ROW_H) })),
      setMixerOpen: (mixerOpen) => set({ mixerOpen }),
      setChordMode: (chordMode) => set({ chordMode }),
      setScaleLock: (scaleLock) => set({ scaleLock }),
      setVelocityLane: (velocityLane) => set({ velocityLane }),
      setMetronome: (metronome) => set({ metronome }),
      setCueStep: (cueStep) => set({ cueStep: Math.max(0, Math.round(cueStep)) }),
    }),
    {
      name: 'crossover-studio/ui',
      version: 1,
      partialize: (s) => ({
        noteLength: s.noteLength,
        velocity: s.velocity,
        stepWidth: s.stepWidth,
        rowHeight: s.rowHeight,
        chordMode: s.chordMode,
        scaleLock: s.scaleLock,
        velocityLane: s.velocityLane,
        metronome: s.metronome,
      }),
    },
  ),
);
