import { useEffect, useRef } from 'react';
import { useStudio, useUi, MAX_STEP_W, MIN_STEP_W } from '../store';
import { engine, useTransport } from '../audio/engine';
import type { InstrumentId, NoteEvent } from '../types';
import {
  chordFrom,
  clamp,
  DEFAULT_VELOCITY,
  INSTRUMENT_ORDER,
  INSTRUMENTS,
  inScale,
  isBlackKey,
  makeId,
  midiToPitch,
  pitchToMidi,
  rowsFor,
  snapToScale,
  STEPS_PER_BAR,
} from '../lib/music';

const KEYS_W = 52;
const RULER_H = 22;
const LANE_H = 64;
const TAP_SLOP = 7; // px of movement before a touch counts as a drag
const RESIZE_HANDLE_PX = 14;

const C = {
  bg: '#141210',
  rowWhite: '#1c1917',
  rowBlack: '#161412',
  rowC: '#211d1a',
  rowOut: '#100e0d',
  rowRoot: '#2a2116',
  stepLine: '#2a2522',
  beatLine: '#3a332e',
  barLine: '#5b5048',
  ruler: '#0f0d0c',
  rulerText: '#a8a29e',
  keyWhite: '#e7e5e4',
  keyBlack: '#292524',
  keyText: '#57534e',
  keyOut: '#a8a29e',
  playhead: '#fbbf24',
  cue: '#38bdf8',
  lane: '#0f0d0c',
  outOfRange: 'rgba(0,0,0,0.45)',
};

type Gesture =
  | { kind: 'create'; pointerId: number; noteIds: string[]; start: number; startX: number; startY: number }
  | { kind: 'resize'; pointerId: number; noteId: string; start: number; origDur: number; startX: number; startY: number; moved: boolean }
  | {
      kind: 'move';
      pointerId: number;
      noteId: string;
      orig: NoteEvent;
      origRow: number;
      grabStep: number;
      grabRow: number;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      kind: 'pan';
      pointerId: number;
      lastX: number;
      lastY: number;
      startX: number;
      startY: number;
      moved: boolean;
      keyPitch?: string;
      fromRuler?: boolean;
    }
  | { kind: 'velocity'; pointerId: number; changed: boolean }
  | { kind: 'pinch'; lastMidX: number; lastMidY: number; lastDist: number };

interface View {
  w: number;
  h: number;
  scrollX: number;
  scrollY: number;
}

export default function PianoRoll() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ w: 0, h: 0, scrollX: 0, scrollY: 0 });
  const dirty = useRef(true);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const scrollMemo = useRef(new Map<InstrumentId, { x: number; y: number }>());
  const lastTrack = useRef<InstrumentId | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let lastPlayhead: number | null = null;

    // ---------- geometry helpers ----------
    const geom = () => {
      const s = useStudio.getState();
      const ui = useUi.getState();
      const v = view.current;
      const rows = rowsFor(s.activeTrackId);
      const laneH = ui.velocityLane ? LANE_H : 0;
      const gridW = v.w - KEYS_W;
      const gridH = Math.max(40, v.h - RULER_H - laneH);
      const rowH = s.activeTrackId === 'cajon' ? Math.max(ui.rowHeight * 1.6, Math.floor(gridH / 4)) : ui.rowHeight;
      const stepW = ui.stepWidth;
      const totalSteps = s.totalBars * STEPS_PER_BAR;
      const scaleType = s.scaleType ?? 'chromatic';
      const scaleRoot = s.scaleRoot ?? 0;
      return { s, ui, rows, rowH, stepW, totalSteps, laneH, gridW, gridH, scaleType, scaleRoot };
    };

    const clampScroll = () => {
      const { rows, rowH, stepW, totalSteps, gridW, gridH } = geom();
      const v = view.current;
      v.scrollX = clamp(v.scrollX, 0, Math.max(0, totalSteps * stepW - gridW));
      v.scrollY = clamp(v.scrollY, 0, Math.max(0, rows.length * rowH - gridH));
    };

    const focusTrack = (id: InstrumentId) => {
      const v = view.current;
      if (lastTrack.current) scrollMemo.current.set(lastTrack.current, { x: v.scrollX, y: v.scrollY });
      lastTrack.current = id;
      const saved = scrollMemo.current.get(id);
      if (saved) {
        v.scrollX = saved.x;
        v.scrollY = saved.y;
      } else {
        const { rows, rowH, gridH } = geom();
        const focusRow = id === 'cajon' ? 0 : rows.indexOf(midiToPitch(INSTRUMENTS[id].focus));
        const centreRow = focusRow >= 0 ? focusRow : rows.length / 2;
        v.scrollY = centreRow * rowH - gridH / 2;
      }
      clampScroll();
      dirty.current = true;
    };

    // ---------- drawing ----------
    const draw = (playhead: number | null) => {
      const v = view.current;
      const { s, ui, rows, rowH, stepW, totalSteps, laneH, gridW, gridH, scaleType, scaleRoot } = geom();
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, v.w, v.h);

      const firstRow = Math.max(0, Math.floor(v.scrollY / rowH));
      const lastRow = Math.min(rows.length - 1, Math.ceil((v.scrollY + gridH) / rowH));
      const firstStep = Math.max(0, Math.floor(v.scrollX / stepW));
      const lastStep = Math.min(totalSteps, Math.ceil((v.scrollX + gridW) / stepW));
      const rowY = (r: number) => RULER_H + r * rowH - v.scrollY;
      const stepX = (st: number) => KEYS_W + st * stepW - v.scrollX;
      const isCajon = s.activeTrackId === 'cajon';
      const useScale = !isCajon && scaleType !== 'chromatic';
      const color = INSTRUMENTS[s.activeTrackId].color;

      // Grid area
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEYS_W, RULER_H, gridW, gridH);
      ctx.clip();

      for (let r = firstRow; r <= lastRow; r++) {
        const p = rows[r];
        let fill: string;
        if (isCajon) fill = r % 2 ? C.rowBlack : C.rowWhite;
        else if (useScale) {
          const m = pitchToMidi(p)!;
          fill = !inScale(m, scaleRoot, scaleType) ? C.rowOut : (m - scaleRoot) % 12 === 0 ? C.rowRoot : C.rowWhite;
        } else fill = isBlackKey(p) ? C.rowBlack : /^C-?\d+$/.test(p) ? C.rowC : C.rowWhite;
        ctx.fillStyle = fill;
        ctx.fillRect(KEYS_W, rowY(r), gridW, rowH);
      }
      const endX = stepX(totalSteps);
      if (endX < v.w) {
        ctx.fillStyle = C.outOfRange;
        ctx.fillRect(endX, RULER_H, v.w - endX, gridH);
      }
      ctx.fillStyle = C.stepLine;
      for (let r = firstRow; r <= lastRow + 1; r++) ctx.fillRect(KEYS_W, Math.round(rowY(r)) - 0.5, gridW, 1);
      for (let st = firstStep; st <= lastStep; st++) {
        const x = Math.round(stepX(st)) - 0.5;
        ctx.fillStyle = st % STEPS_PER_BAR === 0 ? C.barLine : st % 4 === 0 ? C.beatLine : C.stepLine;
        ctx.fillRect(x, RULER_H, st % STEPS_PER_BAR === 0 ? 1.5 : 1, gridH);
      }

      const drawNote = (n: NoteEvent, row: number, noteColor: string, ghost: boolean) => {
        const x = stepX(n.time) + 1;
        const y = rowY(row) + 1;
        const w = Math.max(3, n.duration * stepW - 2);
        const h = rowH - 2;
        if (x > v.w || x + w < KEYS_W || y > RULER_H + gridH || y + h < RULER_H) return;
        const rad = Math.min(4, h / 3);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, rad);
        if (ghost) {
          ctx.globalAlpha = 0.28;
          ctx.strokeStyle = noteColor;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = noteColor;
          ctx.fill();
          ctx.globalAlpha = 1;
          return;
        }
        const vel = n.velocity ?? DEFAULT_VELOCITY;
        ctx.globalAlpha = 0.5 + vel * 0.5;
        ctx.fillStyle = noteColor;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (w > 18) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x + w - 4, y + 3, 2, h - 6);
        }
        if (w > 30 && h >= 14) {
          ctx.fillStyle = 'rgba(12,10,9,0.85)';
          ctx.font = `600 ${Math.min(11, h - 4)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText(n.pitch, x + 4, y + h / 2 + 0.5, w - 10);
        }
      };

      if (s.showGhostNotes && !isCajon) {
        const rowOf = new Map(rows.map((p, i) => [p, i]));
        for (const id of INSTRUMENT_ORDER) {
          if (id === s.activeTrackId || id === 'cajon') continue;
          for (const n of s.tracks[id].notes) {
            const r = rowOf.get(n.pitch);
            if (r !== undefined && r >= firstRow && r <= lastRow) drawNote(n, r, INSTRUMENTS[id].color, true);
          }
        }
      }

      const rowIndex = new Map(rows.map((p, i) => [p, i]));
      const activeNotes = s.tracks[s.activeTrackId].notes;
      for (const n of activeNotes) {
        const r = rowIndex.get(n.pitch);
        if (r !== undefined && r >= firstRow - 1 && r <= lastRow + 1) drawNote(n, r, color, false);
      }

      if (playhead !== null) {
        ctx.fillStyle = C.playhead;
        ctx.fillRect(stepX(playhead) - 1, RULER_H, 2, gridH);
      }
      ctx.restore();

      // Velocity lane
      if (laneH > 0) {
        const top = RULER_H + gridH;
        ctx.save();
        ctx.fillStyle = C.lane;
        ctx.fillRect(0, top, v.w, laneH);
        ctx.fillStyle = C.barLine;
        ctx.fillRect(0, top, v.w, 1);
        ctx.fillStyle = C.rulerText;
        ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('VEL', 10, top + laneH / 2);
        ctx.beginPath();
        ctx.rect(KEYS_W, top + 1, gridW, laneH - 1);
        ctx.clip();
        for (let st = firstStep - (firstStep % 4); st <= lastStep; st += 4) {
          ctx.fillStyle = st % STEPS_PER_BAR === 0 ? C.barLine : C.stepLine;
          ctx.fillRect(Math.round(stepX(st)) - 0.5, top, 1, laneH);
        }
        const usable = laneH - 12;
        for (const n of activeNotes) {
          if (n.time < firstStep - 1 || n.time > lastStep) continue;
          const vel = n.velocity ?? DEFAULT_VELOCITY;
          const x = stepX(n.time) + Math.min(6, stepW / 2);
          const y = top + 6 + usable * (1 - vel);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x - 1, y, 2, top + laneH - 4 - y);
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Ruler
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEYS_W, 0, gridW, RULER_H);
      ctx.clip();
      ctx.fillStyle = C.ruler;
      ctx.fillRect(KEYS_W, 0, gridW, RULER_H);
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (let st = firstStep - (firstStep % 4); st <= lastStep; st += 4) {
        const x = stepX(st);
        if (st % STEPS_PER_BAR === 0) {
          ctx.fillStyle = C.barLine;
          ctx.fillRect(x, 0, 1.5, RULER_H);
          ctx.fillStyle = C.rulerText;
          ctx.fillText(String(st / STEPS_PER_BAR + 1), x + 4, RULER_H / 2);
        } else if (stepW * 4 > 26) {
          ctx.fillStyle = C.beatLine;
          ctx.fillRect(x, RULER_H - 6, 1, 6);
        }
      }
      const marker = (x: number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(x - 6, 0);
        ctx.lineTo(x + 6, 0);
        ctx.lineTo(x, 9);
        ctx.fill();
      };
      if (ui.cueStep > 0 && ui.cueStep < totalSteps) {
        const x = stepX(ui.cueStep);
        marker(x, C.cue);
        ctx.fillRect(x - 0.5, 0, 1, RULER_H);
      }
      if (playhead !== null) marker(stepX(playhead), C.playhead);
      ctx.fillStyle = C.barLine;
      ctx.fillRect(KEYS_W, RULER_H - 1, gridW, 1);
      ctx.restore();

      // Keyboard / drum labels
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, RULER_H, KEYS_W, gridH);
      ctx.clip();
      ctx.fillStyle = C.ruler;
      ctx.fillRect(0, RULER_H, KEYS_W, gridH);
      for (let r = firstRow; r <= lastRow; r++) {
        const p = rows[r];
        const y = rowY(r);
        if (isCajon) {
          ctx.fillStyle = r % 2 ? '#d6d3d1' : C.keyWhite;
          ctx.fillRect(0, y + 1, KEYS_W - 2, rowH - 2);
          ctx.fillStyle = '#292524';
          ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(p, 6, y + rowH / 2);
          continue;
        }
        const black = isBlackKey(p);
        ctx.fillStyle = black ? C.keyBlack : C.keyWhite;
        ctx.fillRect(0, y, black ? KEYS_W * 0.62 : KEYS_W - 2, rowH - (black ? 0 : 1));
        if (black) {
          ctx.fillStyle = C.keyWhite;
          ctx.fillRect(KEYS_W * 0.62, y, KEYS_W * 0.38 - 2, rowH);
          ctx.fillStyle = '#d6d3d1';
          ctx.fillRect(KEYS_W * 0.62, y + rowH / 2, KEYS_W * 0.38 - 2, 1);
        }
        const m = pitchToMidi(p)!;
        if (useScale && inScale(m, scaleRoot, scaleType)) {
          // in-key marker on the keyboard edge
          ctx.fillStyle = (m - scaleRoot) % 12 === 0 ? '#f59e0b' : 'rgba(245,158,11,0.45)';
          ctx.fillRect(KEYS_W - 4, y + 1, 2, rowH - 2);
        }
        const isC = /^C-?\d+$/.test(p);
        if (!black && (isC || rowH >= 20)) {
          ctx.fillStyle = isC ? '#1c1917' : useScale && !inScale(m, scaleRoot, scaleType) ? C.keyOut : C.keyText;
          ctx.font = `${isC ? 700 : 500} ${Math.min(10, rowH - 6)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'right';
          ctx.fillText(p, KEYS_W - 7, y + rowH / 2);
          ctx.textAlign = 'left';
        }
      }
      ctx.restore();

      // Corner
      ctx.fillStyle = C.ruler;
      ctx.fillRect(0, 0, KEYS_W, RULER_H);
      ctx.fillStyle = color;
      ctx.fillRect(8, RULER_H / 2 - 3, 6, 6);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const playhead = engine.playheadStep();
      if (playhead !== null && !gesture.current) {
        // Follow the playhead page-by-page.
        const { stepW, gridW } = geom();
        const v = view.current;
        const x = playhead * stepW;
        if (x < v.scrollX || x > v.scrollX + gridW - 8) {
          v.scrollX = x - 8;
          clampScroll();
        }
      }
      if (playhead !== lastPlayhead) dirty.current = true;
      lastPlayhead = playhead;
      if (!dirty.current) return;
      dirty.current = false;
      draw(playhead);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      view.current.w = Math.max(1, Math.floor(rect.width));
      view.current.h = Math.max(1, Math.floor(rect.height));
      canvas.width = view.current.w * dpr;
      canvas.height = view.current.h * dpr;
      canvas.style.width = `${view.current.w}px`;
      canvas.style.height = `${view.current.h}px`;
      if (lastTrack.current === null) focusTrack(useStudio.getState().activeTrackId);
      clampScroll();
      dirty.current = true;
    };

    // ---------- interaction ----------
    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const cellAt = (x: number, y: number) => {
      const { rows, rowH, stepW } = geom();
      const v = view.current;
      const step = Math.floor((x - KEYS_W + v.scrollX) / stepW);
      const row = Math.floor((y - RULER_H + v.scrollY) / rowH);
      return { step, row, pitch: rows[row] as string | undefined };
    };

    /** Apply scale lock to a row pitch. */
    const lockPitch = (pitch: string): string => {
      const { s, ui, scaleRoot, scaleType } = geom();
      if (!ui.scaleLock || s.activeTrackId === 'cajon' || scaleType === 'chromatic') return pitch;
      const m = pitchToMidi(pitch);
      if (m === null) return pitch;
      const [lo, hi] = INSTRUMENTS[s.activeTrackId].range;
      let snapped = snapToScale(m, scaleRoot, scaleType);
      if (snapped > hi) snapped = snapToScale(m - 1, scaleRoot, scaleType);
      if (snapped < lo) snapped = snapToScale(m + 1, scaleRoot, scaleType);
      return midiToPitch(clamp(snapped, lo, hi));
    };

    const noteAt = (x: number, y: number) => {
      const { s, rows, stepW } = geom();
      const v = view.current;
      const { row } = cellAt(x, y);
      const pitch = rows[row];
      if (!pitch) return null;
      const pos = (x - KEYS_W + v.scrollX) / stepW;
      const notes = s.tracks[s.activeTrackId].notes;
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        if (n.pitch === pitch && pos >= n.time && pos < n.time + n.duration) {
          const rightEdgePx = (n.time + n.duration) * stepW - v.scrollX + KEYS_W;
          const nearEnd = rightEdgePx - x < Math.min(RESIZE_HANDLE_PX, (n.duration * stepW) / 2.5);
          return { note: n, row, nearEnd };
        }
      }
      return null;
    };

    const paintVelocity = (x: number, y: number): boolean => {
      const { s, gridH, laneH, stepW } = geom();
      const step = Math.floor((x - KEYS_W + view.current.scrollX) / stepW);
      const top = RULER_H + gridH;
      const vel = Math.round(clamp(1 - (y - top - 6) / (laneH - 12), 0.05, 1) * 100) / 100;
      const ids = s.tracks[s.activeTrackId].notes.filter((n) => n.time === step && n.velocity !== vel).map((n) => n.id);
      if (!ids.length) return false;
      s.updateNotes(s.activeTrackId, ids, { velocity: vel });
      return true;
    };

    const pan = (dx: number, dy: number) => {
      view.current.scrollX -= dx;
      view.current.scrollY -= dy;
      clampScroll();
      dirty.current = true;
    };

    const startPinch = () => {
      const g = gesture.current;
      if (g && (g.kind === 'create' || g.kind === 'move' || g.kind === 'resize')) useStudio.getState().revert();
      if (g && g.kind === 'velocity') {
        if (g.changed) useStudio.getState().revert();
        else useStudio.getState().dropCheckpoint();
      }
      const pts = [...pointers.current.values()];
      gesture.current = {
        kind: 'pinch',
        lastMidX: (pts[0].x + pts[1].x) / 2,
        lastMidY: (pts[0].y + pts[1].y) / 2,
        lastDist: Math.abs(pts[0].x - pts[1].x),
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const p = local(e);
      canvas.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 2) return startPinch();
      if (pointers.current.size > 2) return;

      const { s: studio, ui, totalSteps, gridH, laneH, scaleRoot, scaleType } = geom();
      const trackId = studio.activeTrackId;
      const base = { pointerId: e.pointerId, startX: p.x, startY: p.y };

      // Velocity lane: paint velocities.
      if (laneH > 0 && p.y > RULER_H + gridH) {
        if (p.x < KEYS_W) return;
        studio.checkpoint();
        gesture.current = { kind: 'velocity', pointerId: e.pointerId, changed: paintVelocity(p.x, p.y) };
        return;
      }
      // Keyboard column: tap to audition, drag to scroll vertically.
      if (p.x < KEYS_W && p.y > RULER_H) {
        const { pitch } = cellAt(KEYS_W, p.y);
        gesture.current = { kind: 'pan', ...base, lastX: p.x, lastY: p.y, moved: false, keyPitch: pitch };
        if (pitch) engine.preview(trackId, pitch, 4, ui.velocity);
        return;
      }
      // Ruler: tap to set the start position, drag to scroll.
      if (p.y < RULER_H) {
        gesture.current = { kind: 'pan', ...base, lastX: p.x, lastY: p.y, moved: false, fromRuler: true };
        return;
      }
      if (ui.tool === 'pan') {
        gesture.current = { kind: 'pan', ...base, lastX: p.x, lastY: p.y, moved: false };
        return;
      }

      const hit = noteAt(p.x, p.y);
      if (hit) {
        studio.checkpoint();
        const { step } = cellAt(p.x, p.y);
        gesture.current = hit.nearEnd
          ? { kind: 'resize', ...base, noteId: hit.note.id, start: hit.note.time, origDur: hit.note.duration, moved: false }
          : { kind: 'move', ...base, noteId: hit.note.id, orig: hit.note, origRow: hit.row, grabStep: step, grabRow: hit.row, moved: false };
        return;
      }

      const cell = cellAt(p.x, p.y);
      if (!cell.pitch || cell.step < 0 || cell.step >= totalSteps) {
        gesture.current = { kind: 'pan', ...base, lastX: p.x, lastY: p.y, moved: false };
        return;
      }
      const step = cell.step;
      const pitch = lockPitch(cell.pitch);
      const duration = trackId === 'cajon' ? 1 : Math.min(ui.noteLength, totalSteps - step);
      let pitches = [pitch];
      if (trackId !== 'cajon' && ui.chordMode !== 'single') {
        const [lo, hi] = INSTRUMENTS[trackId].range;
        pitches = chordFrom(pitchToMidi(pitch)!, ui.chordMode, scaleRoot, scaleType)
          .filter((m) => m >= lo && m <= hi)
          .map(midiToPitch);
      }
      studio.checkpoint();
      const notes: NoteEvent[] = pitches.map((pt) => ({ id: makeId(), pitch: pt, time: step, duration, velocity: ui.velocity }));
      studio.addNotes(trackId, notes);
      for (const n of notes) engine.preview(trackId, n.pitch, duration, ui.velocity);
      navigator.vibrate?.(6);
      gesture.current = { kind: 'create', ...base, noteIds: notes.map((n) => n.id), start: step };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      const p = local(e);
      pointers.current.set(e.pointerId, p);
      const g = gesture.current;
      if (!g) return;

      if (g.kind === 'pinch') {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const dist = Math.abs(pts[0].x - pts[1].x);
        pan(midX - g.lastMidX, midY - g.lastMidY);
        if (g.lastDist > 40 && dist > 40) {
          const ui = useUi.getState();
          const next = clamp(ui.stepWidth * (dist / g.lastDist), MIN_STEP_W, MAX_STEP_W);
          if (Math.abs(next - ui.stepWidth) > 0.25) {
            const anchor = (midX - KEYS_W + view.current.scrollX) / ui.stepWidth;
            useUi.setState({ stepWidth: next });
            view.current.scrollX = anchor * next - (midX - KEYS_W);
            clampScroll();
          }
        }
        g.lastMidX = midX;
        g.lastMidY = midY;
        g.lastDist = dist;
        dirty.current = true;
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      if (g.kind === 'velocity') {
        if (paintVelocity(p.x, p.y)) g.changed = true;
        return;
      }
      const travelled = Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP;
      const studio = useStudio.getState();
      const trackId = studio.activeTrackId;
      const { totalSteps, rows } = geom();

      switch (g.kind) {
        case 'pan': {
          if (!g.moved && !travelled) return;
          g.moved = true;
          const keysOnly = g.keyPitch !== undefined;
          pan(keysOnly ? 0 : p.x - g.lastX, g.fromRuler ? 0 : p.y - g.lastY);
          g.lastX = p.x;
          g.lastY = p.y;
          return;
        }
        case 'create':
        case 'resize': {
          if (g.kind === 'resize') {
            if (!g.moved && !travelled) return;
            g.moved = true;
          }
          if (trackId === 'cajon') return;
          const { step } = cellAt(p.x, p.y);
          const dur = clamp(step - g.start + 1, 1, totalSteps - g.start);
          if (g.kind === 'create') studio.updateNotes(trackId, g.noteIds, { duration: dur });
          else studio.updateNote(trackId, g.noteId, { duration: dur });
          return;
        }
        case 'move': {
          if (!g.moved && !travelled) return;
          g.moved = true;
          const { step, row } = cellAt(p.x, p.y);
          const time = clamp(g.orig.time + (step - g.grabStep), 0, Math.max(0, totalSteps - g.orig.duration));
          const newRow = clamp(g.origRow + (row - g.grabRow), 0, rows.length - 1);
          const pitch = lockPitch(rows[newRow]);
          const cur = studio.tracks[trackId].notes.find((n) => n.id === g.noteId);
          if (cur && (cur.time !== time || cur.pitch !== pitch)) {
            if (cur.pitch !== pitch) engine.preview(trackId, pitch, 1, cur.velocity ?? DEFAULT_VELOCITY);
            studio.updateNote(trackId, g.noteId, { time, pitch });
          }
          return;
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      if (!g) return;
      if (g.kind === 'pinch') {
        if (pointers.current.size === 0) gesture.current = null;
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      gesture.current = null;
      const studio = useStudio.getState();
      const cancelled = e.type === 'pointercancel';

      if (g.kind === 'velocity') {
        if (!g.changed) studio.dropCheckpoint();
        return;
      }
      if (g.kind === 'pan') {
        if (g.fromRuler && !g.moved && !cancelled) {
          const { stepW, totalSteps } = geom();
          const step = clamp(Math.round((g.startX - KEYS_W + view.current.scrollX) / stepW), 0, totalSteps - 1);
          const ui = useUi.getState();
          // Tapping the current cue again clears it.
          ui.setCueStep(Math.abs(step - ui.cueStep) <= 1 && ui.cueStep !== 0 ? 0 : step);
          engine.seek(useUi.getState().cueStep);
          dirty.current = true;
        }
        return;
      }
      if (g.kind === 'create' && cancelled) studio.revert();
      if ((g.kind === 'move' || g.kind === 'resize') && !g.moved) {
        if (cancelled) studio.dropCheckpoint();
        else studio.removeNote(studio.activeTrackId, g.noteId); // tap on a note deletes it
      } else if (g.kind === 'move' || g.kind === 'resize') {
        const n = studio.tracks[studio.activeTrackId].notes.find((x) => x.id === g.noteId);
        const unchanged =
          n && (g.kind === 'move' ? n.time === g.orig.time && n.pitch === g.orig.pitch : n.duration === g.origDur);
        if (unchanged) studio.dropCheckpoint();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const ui = useUi.getState();
        const p = local(e);
        const next = clamp(ui.stepWidth * (e.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_STEP_W, MAX_STEP_W);
        const anchor = (p.x - KEYS_W + view.current.scrollX) / ui.stepWidth;
        useUi.setState({ stepWidth: next });
        view.current.scrollX = anchor * next - (p.x - KEYS_W);
        clampScroll();
        dirty.current = true;
        return;
      }
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      pan(-dx, -dy);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const blockGesture = (e: Event) => e.preventDefault(); // Safari pinch gesture events
    canvas.addEventListener('gesturestart', blockGesture);
    canvas.addEventListener('contextmenu', blockGesture);

    const unsubStudio = useStudio.subscribe((s, prev) => {
      if (s.activeTrackId !== prev.activeTrackId) focusTrack(s.activeTrackId);
      else if (s.totalBars !== prev.totalBars) clampScroll();
      dirty.current = true;
    });
    const unsubUi = useUi.subscribe((s, prev) => {
      if (s.rowHeight !== prev.rowHeight) {
        // keep the vertical centre stable when zooming rows
        const v = view.current;
        const { gridH } = geom();
        const centre = (v.scrollY + gridH / 2) / prev.rowHeight;
        v.scrollY = centre * s.rowHeight - gridH / 2;
      }
      clampScroll();
      dirty.current = true;
    });
    const unsubTransport = useTransport.subscribe(() => (dirty.current = true));

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', blockGesture);
      canvas.removeEventListener('contextmenu', blockGesture);
      unsubStudio();
      unsubUi();
      unsubTransport();
    };
  }, []);

  return (
    <div ref={wrapRef} className="no-touch relative min-h-0 min-w-0 flex-1 overflow-hidden bg-stone-950">
      <canvas
        ref={canvasRef}
        className="no-touch absolute inset-0 block"
        aria-label="Piano roll. Tap an empty cell to add a note, drag to lengthen, tap a note to delete, drag a note to move it, drag its right edge to resize. Tap the ruler to set where playback starts. Two fingers to scroll and zoom."
        role="application"
      />
    </div>
  );
}
