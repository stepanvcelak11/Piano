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
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Piano samples (Salamander Grand, hosted by the Tone.js project)
// ---------------------------------------------------------------------------

export const PIANO_SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

function pianoSampleMap(): Record<string, string> {
  const map: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' };
  for (let oct = 1; oct <= 7; oct++) {
    map[`C${oct}`] = `C${oct}.mp3`;
    map[`D#${oct}`] = `Ds${oct}.mp3`;
    map[`F#${oct}`] = `Fs${oct}.mp3`;
    map[`A${oct}`] = `A${oct}.mp3`;
  }
  return map;
}

/** Decoded piano buffers. AudioBuffers are context-independent so they are shared with offline renders. */
let pianoBuffers: Record<string, Tone.ToneAudioBuffer> | null = null;
let pianoLoad: Promise<boolean> | null = null;

export function pianoSamplesReady(): boolean {
  return pianoBuffers !== null;
}

export function loadPianoSamples(): Promise<boolean> {
  if (pianoLoad) return pianoLoad;
  const map = pianoSampleMap();
  pianoLoad = Promise.all(
    Object.entries(map).map(async ([note, file]) => {
      const buf = await Tone.ToneAudioBuffer.load(PIANO_SAMPLE_BASE_URL + file);
      return [note, new Tone.ToneAudioBuffer(buf)] as const;
    }),
  )
    .then((entries) => {
      pianoBuffers = Object.fromEntries(entries);
      return true;
    })
    .catch((err) => {
      console.warn('[audio] Piano samples unavailable, using synthesized piano.', err);
      pianoLoad = null; // allow a retry later (e.g. when back online)
      return false;
    });
  return pianoLoad;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createPiano(dest: Tone.InputNode): InstrumentVoice {
  const eq = new Tone.EQ3({ low: 1, mid: 0, high: -2 }).connect(dest);
  let sustain = false;

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

/** Plucked upright (pizzicato) bass. */
function createBass(dest: Tone.InputNode): InstrumentVoice {
  const eq = new Tone.EQ3({ low: 3, mid: -1, high: -6, lowFrequency: 180 }).connect(dest);
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
    play: (pitch, dur, time, vel) => synth.triggerAttackRelease(pitch, dur, time, vel),
    releaseAll: (time) => synth.releaseAll(time),
    dispose: () => {
      synth.dispose();
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
