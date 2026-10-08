import { useEffect, useState } from 'react';
import { useStudio } from './store';
import { engine, useTransport } from './audio/engine';
import PianoRoll from './components/PianoRoll';
import TopBar from './components/TopBar';
import TrackRail from './components/TrackRail';
import MixerPanel from './components/MixerPanel';
import StartOverlay from './components/StartOverlay';
import RotateOverlay, { usePortrait } from './components/RotateOverlay';
import ExportDialog from './components/ExportDialog';
import ProjectMenu from './components/ProjectMenu';

export default function App() {
  const audioReady = useTransport((s) => s.audioReady);
  const portrait = usePortrait();
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const [dialog, setDialog] = useState<'export' | 'menu' | null>(null);

  // Desktop keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.toggle();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStudio.getState().redo();
        else useStudio.getState().undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useStudio.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // iOS suspends the AudioContext when backgrounded; resume on the next touch.
  useEffect(() => {
    if (!audioReady) return;
    const resume = () => void engine.resume();
    window.addEventListener('pointerdown', resume, { capture: true });
    return () => window.removeEventListener('pointerdown', resume, { capture: true });
  }, [audioReady]);

  const portraitFallback = portrait && rotateDismissed;

  return (
    <>
      <div
        className={`safe-area flex flex-col bg-stone-950 ${portraitFallback ? 'min-h-[100dvh] overflow-y-auto' : 'h-[100dvh] overflow-hidden'}`}
      >
        <TopBar onExport={() => setDialog('export')} onMenu={() => setDialog('menu')} />
        <main className={`relative flex min-h-0 flex-1 ${portraitFallback ? 'min-h-[560px]' : ''}`}>
          <TrackRail />
          <PianoRoll />
          <MixerPanel />
        </main>
      </div>
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'menu' && <ProjectMenu onClose={() => setDialog(null)} />}
      {portrait && !rotateDismissed && audioReady && <RotateOverlay onDismiss={() => setRotateDismissed(true)} />}
      {!audioReady && <StartOverlay />}
    </>
  );
}
