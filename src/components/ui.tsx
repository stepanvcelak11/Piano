import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  children: ReactNode;
};

export function IconButton({ label, active, className = '', children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-stone-300 transition-colors active:scale-95 disabled:opacity-35 disabled:active:scale-100 ${
        active ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50' : 'hover:bg-stone-800 active:bg-stone-700'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Button that repeats its action while held (for steppers like BPM). */
export function RepeatButton({ label, onStep, children }: { label: string; onStep: () => void; children: ReactNode }) {
  const timer = useRef<number | null>(null);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const start = () => {
    stop();
    stepRef.current();
    let delay = 380;
    const tick = () => {
      stepRef.current();
      delay = Math.max(45, delay * 0.8);
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, delay);
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-stone-300 hover:bg-stone-800 active:bg-stone-700"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && stepRef.current()}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <div className="mx-1 h-6 w-px shrink-0 bg-stone-700" />;
}
