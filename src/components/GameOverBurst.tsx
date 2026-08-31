import { useEffect, useMemo, useState } from 'react';

/**
 * One-shot celebration over the finished board: the verdict throbs bigger and
 * bigger, then blows apart into letters and sparks. Purely decorative — the
 * authoritative result stays in the StatusLine.
 */
export function GameOverBurst({ text, tone }: { text: string; tone: 'win' | 'lose' | 'draw' }) {
  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );
  const [phase, setPhase] = useState<'grow' | 'boom' | 'done'>('grow');

  useEffect(() => {
    if (reduced) {
      setPhase('done');
      return;
    }
    const boom = window.setTimeout(() => setPhase('boom'), 1500);
    const done = window.setTimeout(() => setPhase('done'), 3000);
    return () => {
      window.clearTimeout(boom);
      window.clearTimeout(done);
    };
  }, [reduced]);

  const sparks = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
        const dist = 140 + Math.random() * 260;
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          delay: Math.random() * 0.12,
        };
      }),
    [],
  );

  const color =
    tone === 'win' ? 'text-sky-300' : tone === 'lose' ? 'text-rose-400' : 'text-neutral-200';
  const letters = [...text];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
    >
      {phase === 'grow' ? (
        <span
          className={`azul-burst-grow whitespace-nowrap text-6xl font-black uppercase tracking-tight drop-shadow-[0_0_25px_rgba(0,0,0,0.8)] sm:text-7xl ${color}`}
        >
          {text}
        </span>
      ) : phase === 'boom' ? (
        <>
          <span className="azul-burst-flash absolute h-40 w-40 rounded-full bg-white/70 blur-2xl" />
          <span className="flex whitespace-nowrap text-6xl font-black uppercase tracking-tight sm:text-7xl">
            {letters.map((ch, i) => (
              <span
                key={i}
                className={`azul-burst-letter inline-block drop-shadow-[0_0_25px_rgba(0,0,0,0.8)] ${color}`}
                style={
                  {
                    '--dx': `${(i - (letters.length - 1) / 2) * 60 + (Math.random() - 0.5) * 80}px`,
                    '--dy': `${(Math.random() - 0.5) * 420}px`,
                    '--rot': `${(Math.random() - 0.5) * 180}deg`,
                    animationDelay: `${Math.random() * 0.08}s`,
                  } as React.CSSProperties
                }
              >
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </span>
          {sparks.map((s) => (
            <span
              key={s.id}
              className={`azul-burst-spark absolute h-2 w-2 rounded-full ${
                tone === 'win' ? 'bg-sky-300' : tone === 'lose' ? 'bg-rose-400' : 'bg-neutral-300'
              }`}
              style={
                {
                  '--dx': `${s.x}px`,
                  '--dy': `${s.y}px`,
                  animationDelay: `${s.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      ) : (
        <div className="azul-burst-settle flex items-center justify-center">
          <span
            className={`whitespace-nowrap text-5xl font-black uppercase tracking-wider drop-shadow-[0_0_25px_rgba(0,0,0,0.85)] sm:text-6xl ${color}`}
          >
            {text}
          </span>
        </div>
      )}
    </div>
  );
}
