import * as Tone from 'tone';
import toWav from 'audiobuffer-to-wav';
import type { ProjectState } from '../types';
import { effectiveDuration, INSTRUMENT_ORDER, isAudible, STEPS_PER_BAR } from '../lib/music';
import { MixerGraph } from './graph';
import { loadPianoSamples } from './instruments';
import { stepSeconds } from './engine';

export const EXPORT_TAIL_SECONDS = 3;
export const EXPORT_SAMPLE_RATE = 44100;

/** Render the project offline (faster than real time) and return a 16-bit stereo WAV blob. */
export async function renderProjectToWav(project: ProjectState, loops = 1): Promise<Blob> {
  // Make sure the sampled piano is used if it can be fetched at all.
  await loadPianoSamples();

  const stepSec = stepSeconds(project.bpm);
  const totalSteps = project.totalBars * STEPS_PER_BAR;
  const loopSec = totalSteps * stepSec;
  const duration = loopSec * loops + EXPORT_TAIL_SECONDS;
  const anySolo = INSTRUMENT_ORDER.some((id) => project.tracks[id].solo);

  const rendered = await Tone.Offline(
    async () => {
      const graph = new MixerGraph(project.tracks);
      await graph.ready();
      for (let loop = 0; loop < loops; loop++) {
        for (const id of INSTRUMENT_ORDER) {
          const track = project.tracks[id];
          if (!isAudible(track, anySolo)) continue;
          const voice = graph.strips[id].voice;
          for (const note of track.notes) {
            if (note.time < 0 || note.time >= totalSteps) continue;
            const time = loop * loopSec + note.time * stepSec;
            const dur = Math.max(0.03, effectiveDuration(note, track) * stepSec - 0.005);
            voice.play(note.pitch, dur, time, note.velocity ?? 0.8);
          }
        }
      }
    },
    duration,
    2,
    EXPORT_SAMPLE_RATE,
  );

  const audioBuffer = rendered.get();
  if (!audioBuffer) throw new Error('Offline render produced no audio');
  return new Blob([toWav(audioBuffer)], { type: 'audio/wav' });
}

/** Save a blob: share sheet on mobile when available (iOS "Save to Files"), download link otherwise. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
  if (isTouch && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      // fall through to a regular download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
