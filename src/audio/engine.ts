import * as Tone from 'tone';
import { create } from 'zustand';
import type { InstrumentId, NoteEvent, Track } from '../types';
import { useStudio } from '../store';
import { effectiveDuration, INSTRUMENT_ORDER, isAudible, STEPS_PER_BAR } from '../lib/music';
import { MixerGraph } from './graph';
import { loadPianoSamples } from './instruments';

export type SampleStatus = 'idle' | 'loading' | 'ready' | 'fallback';

interface TransportState {
  audioReady: boolean;
  playing: boolean;
  pianoSamples: SampleStatus;
}

/** Reactive engine status for the UI. */
export const useTransport = create<TransportState>(() => ({
  audioReady: false,
  playing: false,
  pianoSamples: 'idle',
}));

interface ScheduledNote {
  trackId: InstrumentId;
  note: NoteEvent;
}

/** Group notes by start step so the scheduler does O(1) work per 16th. */
export function indexNotesByStep(tracks: Record<InstrumentId, Track>, totalSteps: number) {
  const index = new Map<number, ScheduledNote[]>();
  for (const id of INSTRUMENT_ORDER) {
    for (const note of tracks[id].notes) {
      if (note.time < 0 || note.time >= totalSteps) continue;
      let bucket = index.get(note.time);
      if (!bucket) index.set(note.time, (bucket = []));
      bucket.push({ trackId: id, note });
    }
  }
  return index;
}

export function stepSeconds(bpm: number) {
  return 60 / bpm / 4;
}

type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };

class AudioEngine {
  private graph: MixerGraph | null = null;
  private initPromise: Promise<void> | null = null;
  private stepIndex = new Map<number, ScheduledNote[]>();
  private repeatId: number | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Must be called from a user gesture (tap) to unlock audio on mobile browsers. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInit() {
    // iOS 17+: play through the ringer/silent switch like a media app.
    const nav = navigator as NavigatorWithAudioSession;
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback';
      } catch {
        /* unsupported */
      }
    }

    await Tone.start();
    const ctx = Tone.getContext();
    ctx.lookAhead = 0.05;

    const state = useStudio.getState();
    this.graph = new MixerGraph(state.tracks);

    const transport = Tone.getTransport();
    transport.bpm.value = state.bpm;
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = `${state.totalBars}m`;
    this.stepIndex = indexNotesByStep(state.tracks, state.totalBars * STEPS_PER_BAR);
    this.repeatId = transport.scheduleRepeat((time) => this.tick(time), '16n', 0);

    this.unsubscribe = useStudio.subscribe((s, prev) => {
      if (!this.graph) return;
      if (s.tracks !== prev.tracks || s.totalBars !== prev.totalBars) {
        this.stepIndex = indexNotesByStep(s.tracks, s.totalBars * STEPS_PER_BAR);
      }
      if (s.tracks !== prev.tracks) this.graph.apply(s.tracks, 0.03);
      if (s.bpm !== prev.bpm) transport.bpm.rampTo(s.bpm, 0.05);
      if (s.totalBars !== prev.totalBars) {
        transport.loopEnd = `${s.totalBars}m`;
        if (transport.ticks >= Tone.Time(`${s.totalBars}m`).toTicks()) transport.ticks = 0;
      }
    });

    document.addEventListener('visibilitychange', this.onVisibility);
    useTransport.setState({ audioReady: true });

    // Load the sampled piano in the background; the synth fallback plays meanwhile.
    this.loadPiano();
  }

  loadPiano() {
    useTransport.setState({ pianoSamples: 'loading' });
    loadPianoSamples().then((ok) => {
      useTransport.setState({ pianoSamples: ok ? 'ready' : 'fallback' });
      if (ok && this.graph) {
        this.graph.replaceVoice('piano');
        this.graph.apply(useStudio.getState().tracks);
      }
    });
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
  };

  private tick(time: number) {
    const graph = this.graph;
    if (!graph) return;
    const { tracks, bpm, totalBars } = useStudio.getState();
    const totalSteps = totalBars * STEPS_PER_BAR;
    const ticksPerStep = Tone.getTransport().PPQ / 4;
    const step = Math.round(Tone.getTransport().getTicksAtTime(time) / ticksPerStep) % totalSteps;
    const bucket = this.stepIndex.get(step);
    if (!bucket) return;
    const anySolo = INSTRUMENT_ORDER.some((id) => tracks[id].solo);
    const stepSec = stepSeconds(bpm);
    for (const { trackId, note } of bucket) {
      const track = tracks[trackId];
      if (!isAudible(track, anySolo)) continue;
      const dur = Math.max(0.03, effectiveDuration(note, track) * stepSec - 0.005);
      try {
        graph.strips[trackId].voice.play(note.pitch, dur, time, note.velocity ?? 0.8);
      } catch (err) {
        console.warn('[audio] note dropped', err);
      }
    }
  }

  async play() {
    await this.init();
    if (Tone.getContext().state !== 'running') await Tone.getContext().resume();
    const transport = Tone.getTransport();
    if (transport.state !== 'started') transport.start('+0.05');
    useTransport.setState({ playing: true });
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.ticks = 0;
    if (this.graph) for (const id of INSTRUMENT_ORDER) this.graph.strips[id].voice.releaseAll();
    useTransport.setState({ playing: false });
  }

  toggle() {
    if (useTransport.getState().playing) this.stop();
    else void this.play();
  }

  /** Resume a context the OS suspended (iOS backgrounding, phone calls…). */
  async resume() {
    const ctx = Tone.getContext();
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* needs another gesture */
      }
    }
  }

  /** Current playhead position in (fractional) 16th-note steps, or null when stopped. */
  playheadStep(): number | null {
    const transport = Tone.getTransport();
    if (transport.state !== 'started') return null;
    return transport.ticks / (transport.PPQ / 4);
  }

  /** Audition a note immediately (used when drawing notes or tapping piano keys). */
  preview(trackId: InstrumentId, pitch: string, steps = 2, velocity = 0.8) {
    const graph = this.graph;
    if (!graph) return;
    const ctx = Tone.getContext();
    if (ctx.state !== 'running') void ctx.resume();
    const sec = Math.min(1.2, steps * stepSeconds(useStudio.getState().bpm));
    try {
      graph.strips[trackId].voice.play(pitch, sec, Tone.now() + 0.01, velocity);
    } catch {
      /* voice busy – ignore preview */
    }
  }

  dispose() {
    this.stop();
    if (this.repeatId !== null) Tone.getTransport().clear(this.repeatId);
    this.unsubscribe?.();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.graph?.dispose();
    this.graph = null;
    this.initPromise = null;
    useTransport.setState({ audioReady: false, playing: false });
  }
}

export const engine = new AudioEngine();
