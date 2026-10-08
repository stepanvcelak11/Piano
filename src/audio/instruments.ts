import * as Tone from 'tone';
import type { CajonHit, InstrumentId } from '../types';

/**
 * Every instrument is built by a factory so the same sound design is used for
 * live playback and for offline (WAV) rendering. Factories create their nodes in
 * whatever Tone context is current, which is how `Tone.Offline` works.
 */
export interface InstrumentVoice {
  /** Schedule a note. `duration` and `time` are in seconds (audio-context time). */
  play: (pitch: string, duration: number, time: number, velocity: number) => void;
  releaseAll: (time?: number) => void;
  setSustain?: (on: boolean) => void;
  setArticulation?: (a: 'arco' | 'pizz') => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Bundled samples (served from /samples next to the app, so they work offline)
//   piano  – Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0)
//   violin – Philharmonia Orchestra samples via nbrosowsky/tonejs-instruments
//   bass   – Philharmonia Orchestra contrabass (arco)
// ---------------------------------------------------------------------------

export type SampleSetId = 'piano' | 'violin' | 'bass';

const SAMPLE_FILES: Record<SampleSetId, string[]> = {
  piano: [
    'A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4',
    'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7', 'Ds7', 'Fs7', 'A7', 'C8',
  ],
  violin: ['G3', 'A3', 'C4', 'E4', 'G4', 'A4', 'C5', 'E5', 'G5', 'A5', 'C6', 'E6', 'G6', 'A6', 'C7'],
  bass: ['Fs1', 'G1', 'As1', 'C2', 'D2', 'E2', 'Fs2', 'Gs2', 'A2', 'Cs3', 'E3', 'Gs3', 'B3'],
};

/** Which sample set each instrument plays. */
export const SAMPLE_SET_FOR: Partial<Record<InstrumentId, SampleSetId>> = {
  piano: 'piano',
  violin: 'violin',
  viola: 'violin',
  bass: 'bass',
};

export function sampleBaseUrl(): string {
  return `${import.meta.env.BASE_URL ?? './'}samples/`;
}

/** Decoded buffers. AudioBuffers are context-independent so they are shared with offline renders. */
const buffers: Partial<Record<SampleSetId, Record<string, Tone.ToneAudioBuffer>>> = {};
const loading: Partial<Record<SampleSetId, Promise<boolean>>> = {};

export function samplesReady(set: SampleSetId): boolean {
  return !!buffers[set];
}

export function loadSampleSet(set: SampleSetId): Promise<boolean> {
  const pending = loading[set];
  if (pending) return pending;
  const base = sampleBaseUrl();
  const p = Promise.all(
    SAMPLE_FILES[set].map(async (file) => {
      const buf = await Tone.ToneAudioBuffer.load(`${base}${set}/${file}.mp3`);
      return [file.replace('s', '#'), new Tone.ToneAudioBuffer(buf)] as const;
    }),
  )
    .then((entries) => {
      buffers[set] = Object.fromEntries(entries);
      return true;
    })
    .catch((err) => {
      console.warn(`[audio] ${set} samples unavailable, using synthesized fallback.`, err);
      delete loading[set]; // allow a retry later
      return false;
    });
  loading[set] = p;
  return p;
}

export function loadAllSamples(): Promise<boolean[]> {
  return Promise.all((Object.keys(SAMPLE_FILES) as SampleSetId[]).map(loadSampleSet));
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createPiano(dest: Tone.InputNode): InstrumentVoice {
  const eq = new Tone.EQ3({ low: 1, mid: 0, high: -2 }).connect(dest);
  let sustain = false;

  const pianoBuffers = buffers.piano;
  if (pianoBuffers) {
    const sampler = new Tone.Sampler({ urls: pianoBuffers, release: 0.8, curve: 'exponential' }).connect(eq);
    return {
      play: (pitch, dur, time, vel) => sampler.triggerAttackRelease(pitch, dur, time, vel),
      releaseAll: (time) => sampler.releaseAll(time),
      setSustain: (on) => {
        sustain = on;
        sampler.release = sustain ? 1.6 : 0.8;
      },
      dispose: () => {
        sampler.dispose();
        eq.dispose();
      },
    };
  }

  // Synth fallback: FM electric-grand-ish tone with a percussive envelope.
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 10,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 1.6, sustain: 0.1, release: 0.8 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.4 },
  });
  synth.maxPolyphony = 24;
  synth.volume.value = -10;
  synth.connect(eq);
  return {
    play: (pitch, dur, time, vel) => synth.triggerAttackRelease(pitch, dur, time, vel),
    releaseAll: (time) => synth.releaseAll(time),
    setSustain: (on) => synth.set({ envelope: { release: on ? 1.6 : 0.8 } }),
    dispose: () => {
      synth.dispose();
      eq.dispose();
    },
  };
}

/** Bowed string section voice: detuned saw pair with delayed vibrato and a soft bow attack. */
function createStrings(dest: Tone.InputNode, kind: 'violin' | 'viola'): InstrumentVoice {
  const bright = kind === 'violin';
  const body = new Tone.Filter({ type: 'lowpass', frequency: bright ? 5200 : 3400, Q: 0.7 }).connect(dest);
  const formant = new Tone.Filter({ type: 'peaking', frequency: bright ? 2800 : 1600, gain: 4, Q: 1.2 }).connect(body);

  const violinBuffers = buffers.violin;
  if (violinBuffers) {
    // Viola: the violin recordings played lower, with the top end rolled off and more body.
    body.frequency.value = bright ? 9000 : 3800;
    formant.set(bright ? { frequency: 3000, gain: 0 } : { frequency: 420, gain: 3.5, Q: 0.9 });
    const sampler = new Tone.Sampler({ urls: violinBuffers, attack: 0.03, release: 0.35, curve: 'exponential' }).connect(formant);
    sampler.volume.value = bright ? -2 : 0;
    return {
      play: (pitch, dur, time, vel) => sampler.triggerAttackRelease(pitch, dur, time, vel),
      releaseAll: (time) => sampler.releaseAll(time),
      dispose: () => {
        sampler.dispose();
        formant.dispose();
        body.dispose();
      },
    };
  }

  const synth = new Tone.PolySynth(Tone.DuoSynth, {
    harmonicity: 1.006,
    vibratoAmount: bright ? 0.18 : 0.14,
    vibratoRate: bright ? 5.6 : 5.0,
    voice0: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.12, decay: 0.2, sustain: 0.85, release: 0.45 },
      filter: { type: 'lowpass', Q: 0.5, rolloff: -24 },
      filterEnvelope: { attack: 0.18, decay: 0.3, sustain: 0.7, release: 0.5, baseFrequency: bright ? 700 : 450, octaves: 3 },
    },
    voice1: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.16, decay: 0.2, sustain: 0.8, release: 0.5 },
      filter: { type: 'lowpass', Q: 0.5, rolloff: -24 },
      filterEnvelope: { attack: 0.22, decay: 0.3, sustain: 0.6, release: 0.5, baseFrequency: bright ? 600 : 380, octaves: 2.6 },
    },
  });
  synth.maxPolyphony = 8;
  synth.volume.value = -14;
  synth.connect(formant);
  return {
    play: (pitch, dur, time, vel) => synth.triggerAttackRelease(pitch, dur, time, vel),
    releaseAll: (time) => synth.releaseAll(time),
    dispose: () => {
      synth.dispose();
      formant.dispose();
      body.dispose();
    },
  };
}

/** Upright bass: bowed (arco) samples, or a plucked (pizzicato) synth. */
function createBass(dest: Tone.InputNode): InstrumentVoice {
  const eq = new Tone.EQ3({ low: 3, mid: -1, high: -6, lowFrequency: 180 }).connect(dest);
  const arcoBuffers = buffers.bass;
  const arco = arcoBuffers
    ? new Tone.Sampler({ urls: arcoBuffers, attack: 0.02, release: 0.3, curve: 'exponential' }).connect(eq)
    : null;
  if (arco) arco.volume.value = 2;
  let articulation: 'arco' | 'pizz' = 'arco';
  const synth = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: 'fattriangle', count: 2, spread: 12 },
    envelope: { attack: 0.004, decay: 1.2, sustain: 0.12, release: 0.35 },
    filter: { type: 'lowpass', Q: 1.2, rolloff: -24 },
    filterEnvelope: { attack: 0.002, decay: 0.35, sustain: 0.25, release: 0.4, baseFrequency: 90, octaves: 3.5 },
  });
  synth.maxPolyphony = 4;
  synth.volume.value = -4;
  synth.connect(eq);
  return {
    play: (pitch, dur, time, vel) => {
      if (arco && articulation === 'arco') arco.triggerAttackRelease(pitch, dur, time, vel);
      else synth.triggerAttackRelease(pitch, dur, time, vel);
    },
    releaseAll: (time) => {
      synth.releaseAll(time);
      arco?.releaseAll(time);
    },
    setArticulation: (a) => (articulation = a),
    dispose: () => {
      synth.dispose();
      arco?.dispose();
      eq.dispose();
    },
  };
}

/** Cajón: membrane "boom" for the bass tone, filtered noise + body for slap / tip / side. */
function createCajon(dest: Tone.InputNode): InstrumentVoice {
  const bus = new Tone.Gain(1).connect(dest);

  const boom = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.2 },
  });
  const boomFilter = new Tone.Filter(900, 'lowpass').connect(bus);
  boom.connect(boomFilter);
  boom.volume.value = -2;

  const knock = new Tone.MembraneSynth({
    pitchDecay: 0.012,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
  }).connect(bus);
  knock.volume.value = -8;

  const wiresFilter = new Tone.Filter({ type: 'bandpass', frequency: 2600, Q: 0.9 }).connect(bus);
  const wires = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 },
  }).connect(wiresFilter);
  wires.volume.value = -4;

  const tipFilter = new Tone.Filter({ type: 'highpass', frequency: 3500 }).connect(bus);
  const tip = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.02 },
  }).connect(tipFilter);
  tip.volume.value = -6;

  const sideFilter = new Tone.Filter({ type: 'bandpass', frequency: 1100, Q: 1.6 }).connect(bus);
  const side = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.03 },
  }).connect(sideFilter);
  side.volume.value = 2;

  // Each voice is monophonic; nudge identical start times so rapid repeats never throw.
  const last = new Map<string, number>();
  const at = (key: string, time: number) => {
    const prev = last.get(key) ?? -1;
    const t = time <= prev ? prev + 0.001 : time;
    last.set(key, t);
    return t;
  };

  const hits: Record<CajonHit, (time: number, vel: number) => void> = {
    BASS: (t, v) => {
      boom.triggerAttackRelease('A1', 0.3, at('boom', t), v);
      tip.triggerAttackRelease(0.02, at('tip', t), v * 0.15);
    },
    SLAP: (t, v) => {
      knock.triggerAttackRelease('D3', 0.08, at('knock', t), v);
      wires.triggerAttackRelease(0.14, at('wires', t), v);
    },
    TIP: (t, v) => {
      tip.triggerAttackRelease(0.04, at('tip', t), v);
      wires.triggerAttackRelease(0.05, at('wires', t), v * 0.3);
    },
    SIDE: (t, v) => {
      knock.triggerAttackRelease('A3', 0.06, at('knock', t), v * 0.8);
      side.triggerAttackRelease(0.07, at('side', t), v);
    },
  };

  return {
    play: (pitch, _dur, time, vel) => hits[pitch as CajonHit]?.(time, vel),
    releaseAll: () => {},
    dispose: () => {
      [boom, boomFilter, knock, wires, wiresFilter, tip, tipFilter, side, sideFilter, bus].forEach((n) => n.dispose());
    },
  };
}

export function createInstrument(id: InstrumentId, dest: Tone.InputNode): InstrumentVoice {
  switch (id) {
    case 'piano':
      return createPiano(dest);
    case 'violin':
      return createStrings(dest, 'violin');
    case 'viola':
      return createStrings(dest, 'viola');
    case 'bass':
      return createBass(dest);
    case 'cajon':
      return createCajon(dest);
  }
}
