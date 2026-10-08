# Crossover Studio

A mobile-first web DAW: a small, acoustic-focused FL Studio–style piano roll for classical crossover. It has five tracks: piano, violin, viola, upright bass and cajón. It runs in mobile Safari and Chrome straight from a URL, with nothing to install, and keeps working offline after the first visit.

**Live app:** https://stepanvcelak11.github.io/Piano/ (deployed by GitHub Actions on every push)

## Features
- **Piano roll:** tap to add, drag right to lengthen, tap a note to delete, drag to move, drag the right edge to resize. Two-finger scroll and pinch-zoom. Tap the keyboard to hear a note.
- **Chord stamps:** place a triad, 7th or octave with one tap. Chords follow the song's key.
- **Key & scale:** in-key rows are highlighted, and an optional snap keeps new and moved notes in the scale.
- **Velocity lane:** drag across it to paint note dynamics.
- **Ghost notes:** the other tracks show faintly in the background.
- **Transport:** play/stop, start point (tap the ruler), metronome, tempo 40–240 BPM, 1–16 bars, swing, duplicate loop.
- **Mixer:** volume (−60…+6 dB), reverb send, mute/solo. Piano sustain pedal (re-pedals every bar). Arco or pizzicato bass.
- **Editing tools:** undo/redo, transpose a track by a semitone or an octave.
- **Projects:** autosave, named projects on the device, and project files (.json) you can open again.
- **Export:** WAV mixdown (offline render, 1×/2×/4× loop, preview player) and MIDI for FL Studio, Logic, Ableton or MuseScore. Phones get the share sheet so the file can go to Files.
- **Mobile handling:** audio unlock overlay, rotate-to-landscape prompt with a portrait fallback, plays with the iOS silent switch on (iOS 17+), keeps the screen awake while playing, resumes after backgrounding.

## Stack
Vite · React 19 · TypeScript · Tailwind CSS v4 · Lucide icons · Zustand (saved to `localStorage`) · Tone.js 15 · `Tone.Offline` + `audiobuffer-to-wav` · service worker for offline use.

## Scripts
```bash
npm install
npm run dev             # dev server on your LAN (open it on your phone)
npm run build           # typecheck + production build to dist/
npm test                # unit tests (vitest)
npm run build:artifact  # build + dist/artifact.html for embedding as a claude.ai Artifact
```
`dist/` is fully static with relative paths, so it can be hosted on any static host or sub-path.

### Enabling GitHub Pages (one-time)
Go to repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then re-run the "Deploy to GitHub Pages" workflow from the Actions tab, or push a commit.

## Sounds
All samples are bundled in `public/samples` (about 4.8 MB, trimmed to 8 s and re-encoded as MP3 for fast mobile loading):
- **Piano:** Salamander Grand Piano V3 by Alexander Holm (CC-BY 3.0), from `@audio-samples/piano-mp3-velocity8`.
- **Violin / viola:** Philharmonia Orchestra violin samples, from `tonejs-instrument-violin-mp3` (nbrosowsky/tonejs-instruments). The viola plays the violin recordings lower with a darker tone.
- **Bass (arco):** Philharmonia Orchestra contrabass samples, from `tonejs-instrument-contrabass-mp3`. Pizzicato is synthesized.
- **Cajón:** synthesized BASS / SLAP / TIP / SIDE strokes.

Each instrument falls back to a synthesized voice while its samples load. Live playback and WAV export share the same instrument and mixer code (`src/audio/graph.ts`), so the export sounds like what you hear.

## Project layout
```
src/types.ts              data schema (NoteEvent, Track, ProjectState)
src/store.ts              project store (persisted, undo/redo), project library, UI prefs
src/lib/music.ts          pitch helpers, ranges, scales & chords, playback rules
src/lib/midi.ts           Standard MIDI File writer
src/lib/save.ts           save/share helper (browser, phone share sheet, embedded preview)
src/audio/instruments.ts  instrument factories + bundled sample loading
src/audio/graph.ts        mixer graph (channels, sends, reverb, limiter)
src/audio/engine.ts       live engine: unlock, transport, scheduler, metronome, swing
src/audio/export.ts       Tone.Offline render → WAV
src/components/           PianoRoll (canvas), TopBar, TrackRail, MixerPanel, dialogs, overlays
public/sw.js              offline cache
```
