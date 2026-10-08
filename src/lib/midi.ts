import type { CajonHit, InstrumentId, ProjectState } from '../types';
import { effectiveDuration, INSTRUMENT_ORDER, isAudible, pitchToMidi, STEPS_PER_BAR } from './music';

/** Standard MIDI File (format 1) writer – lets a sketch continue in FL Studio, Logic, Ableton, Sibelius… */

export const MIDI_PPQ = 480;
const TICKS_PER_STEP = MIDI_PPQ / 4;

const GM: Record<Exclude<InstrumentId, 'cajon'>, { channel: number; program: number }> = {
  piano: { channel: 0, program: 0 }, // Acoustic Grand
  violin: { channel: 1, program: 40 },
  viola: { channel: 2, program: 41 },
  bass: { channel: 3, program: 43 }, // Contrabass (45 = pizzicato strings)
};
const DRUM_CHANNEL = 9;
const CAJON_TO_GM: Record<CajonHit, number> = { BASS: 36, SLAP: 38, TIP: 42, SIDE: 37 };

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function str(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0) & 0x7f);
}

function u32(n: number) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

interface Ev {
  tick: number;
  order: number; // note-offs before note-ons at the same tick
  data: number[];
}

function chunk(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00); // end of track
  return [...str('MTrk'), ...u32(body.length), ...body];
}

function dbToCc(db: number) {
  return Math.max(0, Math.min(127, Math.round(127 * Math.pow(10, Math.min(db, 0) / 40))));
}

export function projectToMidi(project: ProjectState): Uint8Array<ArrayBuffer> {
  const totalSteps = project.totalBars * STEPS_PER_BAR;
  const swingTicks = (step: number) => (step % 2 === 1 ? Math.round((project.swing ?? 0) * TICKS_PER_STEP / 3) : 0);
  const anySolo = INSTRUMENT_ORDER.some((id) => project.tracks[id].solo);

  const usPerQuarter = Math.round(60_000_000 / project.bpm);
  const tempo: Ev[] = [
    { tick: 0, order: 0, data: [0xff, 0x03, ...vlq((project.name ?? 'Crossover').length), ...str(project.name ?? 'Crossover')] },
    { tick: 0, order: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff] },
    { tick: 0, order: 0, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] }, // 4/4
  ];
  const chunks = [chunk(tempo)];

  for (const id of INSTRUMENT_ORDER) {
    const track = project.tracks[id];
    if (!isAudible(track, anySolo)) continue;
    const isDrum = id === 'cajon';
    const ch = isDrum ? DRUM_CHANNEL : GM[id].channel;
    const program = isDrum ? 0 : id === 'bass' && track.articulation === 'pizz' ? 45 : GM[id].program;
    const evs: Ev[] = [
      { tick: 0, order: 0, data: [0xff, 0x03, ...vlq(track.name.length), ...str(track.name)] },
      { tick: 0, order: 0, data: [0xc0 | ch, program] },
      { tick: 0, order: 0, data: [0xb0 | ch, 7, dbToCc(track.volume)] },
      { tick: 0, order: 0, data: [0xb0 | ch, 91, Math.round(track.reverbSend * 127)] },
    ];
    for (const n of track.notes) {
      if (n.time >= totalSteps) continue;
      const key = isDrum ? CAJON_TO_GM[n.pitch as CajonHit] : pitchToMidi(n.pitch);
      if (key === undefined || key === null) continue;
      const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.8) * 127)));
      const on = n.time * TICKS_PER_STEP + swingTicks(n.time);
      const len = isDrum ? 1 : Math.min(effectiveDuration(n, track), totalSteps - n.time);
      const off = Math.max(on + 1, n.time * TICKS_PER_STEP + len * TICKS_PER_STEP - 1);
      evs.push({ tick: on, order: 1, data: [0x90 | ch, key, vel] });
      evs.push({ tick: off, order: 0, data: [0x80 | ch, key, 0] });
    }
    chunks.push(chunk(evs));
  }

  const header = [...str('MThd'), ...u32(6), 0, 1, 0, chunks.length, (MIDI_PPQ >> 8) & 0xff, MIDI_PPQ & 0xff];
  return new Uint8Array([...header, ...chunks.flat()]);
}
