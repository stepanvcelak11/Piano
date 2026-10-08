# Crossover Studio

A mobile-first web DAW: a small, acoustic-focused FL Studio–style piano roll for classical crossover. It has five tracks: piano, violin, viola, upright bass and cajón. It runs in mobile Safari and Chrome straight from a URL, with nothing to install.

## Stack
Vite · React 19 · TypeScript · Tailwind CSS v4 · Lucide icons · Zustand (saved to `localStorage`) · Tone.js 15 · `Tone.Offline` + `audiobuffer-to-wav` for export.

## Scripts
```bash
npm install
npm run dev        # dev server on your LAN (open it on your phone)
npm run build      # typecheck + production build to dist/
npm test           # unit tests (vitest)
```
`dist/` is fully static and uses relative paths, so it can be hosted on any static host or sub-path (GitHub Pages, Netlify, S3…). Mobile browsers need **HTTPS** for some features (sharing files, `audioSession`).

## Using it
- **Tap to Enter Studio** unlocks Web Audio (a requirement on iOS and Android).
- **Piano roll:** tap an empty cell to add a note, then drag right to make it longer. Tap a note to delete it. Drag a note to move it, or drag its right edge to resize it.
- **Two fingers** scroll and pinch-zoom the grid. Drag the keyboard to scroll vertically, and tap a key to hear it. The ✋ tool switches one-finger dragging to scrolling.
- **Ghost notes** show the other pitched tracks faintly in the background.
- **Mixer:** volume (−60…+6 dB), reverb send, mute and solo, and a piano **PEDAL** that re-pedals at every bar line.
- **Export:** renders offline to a 44.1 kHz stereo WAV with 1×, 2× or 4× loop repeats. On phones, the share sheet opens so you can save the file (for example to Files).
- **Undo/redo** (also Ctrl/⌘+Z, Ctrl+Y or Shift+⌘+Z) and **Space** to play or stop on desktop.

## Sound sources
- **Piano:** Salamander Grand samples streamed from `tonejs.github.io`. While they load, or if they can't be reached, an FM piano synth plays instead. You can retry loading from the ⋯ menu.
- **Violin / viola:** synthesized bowed strings (detuned saws, delayed vibrato, body filter).
- **Bass:** synthesized pizzicato upright.
- **Cajón:** synthesized BASS / SLAP / TIP / SIDE strokes.

The same instrument and mixer code drives both live playback and WAV export (`src/audio/graph.ts`), so the exported file sounds like what you hear.

## Project layout
```
src/types.ts              data schema (NoteEvent, Track, ProjectState)
src/store.ts              Zustand project store (persisted, undo/redo) + UI prefs
src/lib/music.ts          pitch helpers, instrument ranges, playback rules
src/lib/demo.ts           default / demo project
src/audio/instruments.ts  instrument factories + piano sample loading
src/audio/graph.ts        mixer graph (channels, sends, reverb, limiter)
src/audio/engine.ts       live engine: unlock, transport, 16th-step scheduler, preview
src/audio/export.ts       Tone.Offline render → WAV, save/share
src/components/           PianoRoll (canvas), TopBar, TrackRail, MixerPanel, overlays, dialogs
```
