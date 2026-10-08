export type InstrumentId = 'piano' | 'violin' | 'viola' | 'bass' | 'cajon';

export type CajonHit = 'BASS' | 'SLAP' | 'TIP' | 'SIDE';

export interface NoteEvent {
  id: string;
  pitch: string; // e.g., 'C4', 'F#3' (for Cajon: 'BASS' | 'SLAP' | 'TIP' | 'SIDE')
  time: number; // Step index (0 to 63 for 4 bars of 16th notes)
  duration: number; // Length in steps (default 1)
  velocity?: number;
}

export type ScaleType = 'chromatic' | 'major' | 'minor' | 'harmonicMinor' | 'dorian' | 'pentatonic';
export type Articulation = 'arco' | 'pizz';

export interface Track {
  id: InstrumentId;
  name: string;
  muted: boolean;
  solo: boolean;
  volume: number; // dB (-60 to +6)
  reverbSend: number; // 0 to 1
  sustain?: boolean; // For piano
  articulation?: Articulation; // For bass: bowed samples or plucked synth
  notes: NoteEvent[];
}

export interface ProjectState {
  bpm: number;
  totalBars: number; // default 4 bars (64 steps)
  activeTrackId: InstrumentId;
  showGhostNotes: boolean;
  tracks: Record<InstrumentId, Track>;
  // --- extensions (optional so older saves stay valid) ---
  name?: string;
  swing?: number; // 0 (straight) to 1 (hard shuffle), applied to off-beat 16ths
  scaleRoot?: number; // 0 = C … 11 = B
  scaleType?: ScaleType;
}
