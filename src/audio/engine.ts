import * as Tone from 'tone';
import { create } from 'zustand';
import type { InstrumentId, NoteEvent, Track } from '../types';
import { useStudio, useUi } from '../store';
import { effectiveDuration, INSTRUMENT_ORDER, isAudible, STEPS_PER_BAR } from '../lib/music';
import { MixerGraph } from './graph';
import { loadSampleSet, SAMPLE_SET_FOR, type SampleSetId } from './instruments';

export type SampleStatus = 'idle' | 'loading' | 'ready' | 'fallback';

interface TransportState {
  audioReady: boolean;
  playing: boolean;
  samples: Record<SampleSetId, SampleStatus>;
}

/** Reactive engine status for the UI. */
export const useTransport = create<TransportState>(() => ({
  audioReady: false,
  playing: false,
  samples: { piano: 'idle', violin: 'idle', bass: 'idle' },
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

/** Delay applied to off-beat 16ths for swing (0 → straight, 1 → full triplet shuffle). */
export function swingOffset(step: number, swing: number, stepSec: number) {
  return step % 2 === 1 ? swing * stepSec * (1 / 3) : 0;
}

type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };
type WakeLockSentinelLike = { release: () => Promise<void> };

class AudioEngine {
  private graph: MixerGraph | null = null;
  private click: Tone.Synth | null = null;
  private initPromise: Promise<void> | null = null;
  private stepIndex = new Map<number, ScheduledNote[]>();
  private repeatId: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;

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
    this.click = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -16,
    }).toDestination();

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
        if (useUi.getState().cueStep >= s.totalBars * STEPS_PER_BAR) useUi.getState().setCueStep(0);
      }
    });

    document.addEventListener('visibilitychange', this.onVisibility);
    useTransport.setState({ audioReady: true });

    // Stream the sampled instruments in the background; synth fallbacks play meanwhile.
    this.loadSamples();
  }

  loadSamples() {
    for (const set of ['piano', 'violin', 'bass'] as SampleSetId[]) {
      if (useTransport.getState().samples[set] === 'ready') continue;
      useTransport.setState((s) => ({ samples: { ...s.samples, [set]: 'loading' } }));
      loadSampleSet(set).then((ok) => {
        useTransport.setState((s) => ({ samples: { ...s.samples, [set]: ok ? 'ready' : 'fallback' } }));
        if (!ok || !this.graph) return;
        for (const id of INSTRUMENT_ORDER) if (SAMPLE_SET_FOR[id] === set) this.graph.replaceVoice(id);
        this.graph.apply(useStudio.getState().tracks);
      });
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
  };

  private tick(time: number) {
    const graph = this.graph;
    if (!graph) return;
    const { tracks, bpm, totalBars, swing = 0 } = useStudio.getState();
    const totalSteps = totalBars * STEPS_PER_BAR;
    const transport = Tone.getTransport();
    const ticksPerStep = transport.PPQ / 4;
    const step = Math.round(transport.getTicksAtTime(time) / ticksPerStep) % totalSteps;
    const stepSec = stepSeconds(bpm);

    if (useUi.getState().metronome && step % 4 === 0) {
      this.click?.triggerAttackRelease(step % STEPS_PER_BAR === 0 ? 'C6' : 'G5', 0.03, time, step % 16 === 0 ? 1 : 0.6);
    }

    const bucket = this.stepIndex.get(step);
    if (!bucket) return;
    const anySolo = INSTRUMENT_ORDER.some((id) => tracks[id].solo);
    const at = time + swingOffset(step, swing, stepSec);
    for (const { trackId, note } of bucket) {
      const track = tracks[trackId];
      if (!isAudible(track, anySolo)) continue;
      const dur = Math.max(0.03, effectiveDuration(note, track) * stepSec - 0.005);
      try {
        graph.strips[trackId].voice.play(note.pitch, dur, at, note.velocity ?? 0.8);
      } catch (err) {
        console.warn('[audio] note dropped', err);
      }
    }
  }

  async play() {
    await this.init();
    await this.resume();
    const transport = Tone.getTransport();
    if (transport.state !== 'started') {
      const { cueStep } = useUi.getState();
      const totalSteps = useStudio.getState().totalBars * STEPS_PER_BAR;
      transport.ticks = (cueStep < totalSteps ? cueStep : 0) * (transport.PPQ / 4);
      transport.start('+0.05');
    }
    useTransport.setState({ playing: true });
    void this.holdWakeLock();
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.ticks = 0;
    if (this.graph) for (const id of INSTRUMENT_ORDER) this.graph.strips[id].voice.releaseAll();
    useTransport.setState({ playing: false });
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  toggle() {
    if (useTransport.getState().playing) this.stop();
    else void this.play();
  }

  /** Jump the playhead (used when tapping the ruler while playing). */
  seek(step: number) {
    const transport = Tone.getTransport();
    if (transport.state === 'started') transport.ticks = step * (transport.PPQ / 4);
  }

  /** Keep the phone screen awake while the song plays. */
  private async holdWakeLock() {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl || this.wakeLock) return;
    try {
      this.wakeLock = await wl.request('screen');
    } catch {
      /* denied or unsupported */
    }
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
    this.click?.dispose();
    this.graph = null;
    this.initPromise = null;
    useTransport.setState({ audioReady: false, playing: false });
  }
}

export const engine = new AudioEngine();
