import * as Tone from 'tone';
import type { InstrumentId, Track } from '../types';
import { INSTRUMENT_ORDER, isAudible, MIN_VOLUME_DB } from '../lib/music';
import { createInstrument, type InstrumentVoice } from './instruments';

export interface TrackStrip {
  voice: InstrumentVoice;
  channel: Tone.Channel;
  send: Tone.Gain;
}

/**
 * The full mixer: instrument → channel (fader / mute) → master bus,
 * with a post-fader send from every channel into a shared hall reverb.
 * Built in the *current* Tone context, so it is reused verbatim by Tone.Offline.
 */
export class MixerGraph {
  readonly strips: Record<InstrumentId, TrackStrip>;
  readonly reverb: Tone.Reverb;
  readonly master: Tone.Gain;
  private readonly limiter: Tone.Limiter;

  constructor(tracks: Record<InstrumentId, Track>, destination: Tone.InputNode = Tone.getDestination()) {
    this.limiter = new Tone.Limiter(-1).connect(destination);
    this.master = new Tone.Gain(1.5).connect(this.limiter);
    this.reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.025, wet: 1 }).connect(this.master);

    const strips = {} as Record<InstrumentId, TrackStrip>;
    for (const id of INSTRUMENT_ORDER) {
      const channel = new Tone.Channel({ volume: 0, pan: 0 }).connect(this.master);
      const send = new Tone.Gain(0).connect(this.reverb);
      channel.connect(send);
      strips[id] = { voice: createInstrument(id, channel), channel, send };
    }
    this.strips = strips;
    this.apply(tracks);
  }

  /** Wait for the reverb impulse response to be generated. */
  ready(): Promise<void> {
    return this.reverb.ready;
  }

  /** Push mixer settings (volume, mute/solo, sends, sustain) into the audio graph. */
  apply(tracks: Record<InstrumentId, Track>, rampTime = 0) {
    const anySolo = INSTRUMENT_ORDER.some((id) => tracks[id].solo);
    for (const id of INSTRUMENT_ORDER) {
      const t = tracks[id];
      const s = this.strips[id];
      const vol = t.volume <= MIN_VOLUME_DB ? -Infinity : t.volume;
      if (rampTime > 0 && Number.isFinite(vol)) s.channel.volume.rampTo(vol, rampTime);
      else s.channel.volume.value = vol;
      s.channel.mute = !isAudible(t, anySolo);
      if (rampTime > 0) s.send.gain.rampTo(t.reverbSend, rampTime);
      else s.send.gain.value = t.reverbSend;
      s.voice.setSustain?.(!!t.sustain);
      s.voice.setArticulation?.(t.articulation ?? 'arco');
    }
  }

  replaceVoice(id: InstrumentId) {
    const strip = this.strips[id];
    strip.voice.releaseAll();
    strip.voice.dispose();
    strip.voice = createInstrument(id, strip.channel);
  }

  dispose() {
    for (const id of INSTRUMENT_ORDER) {
      const s = this.strips[id];
      s.voice.dispose();
      s.send.dispose();
      s.channel.dispose();
    }
    this.reverb.dispose();
    this.master.dispose();
    this.limiter.dispose();
  }
}
