import { useEffect, useRef } from 'react';

import type { Session } from '../game/useGameSession';
import { DisplayArea } from './DisplayArea';
import { PlayerBoard } from './PlayerBoard';

/**
 * The whole table: the sources on top, then both player boards.
 *
 * Keyboard model (§9.2): Tab and the arrow keys move a focus ring across every
 * enabled control, Enter or Space activates (native button behavior), Escape
 * clears a pending selection. No key performs an undo (AC-008).
 */
export function Board({
  session,
  humanLabel,
  opponentLabel,
}: {
  session: Session;
  humanLabel: string;
  opponentLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { clearSelection, humanSeat, game, status } = session;

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (session.canUndo) {
          event.preventDefault();
          session.undo();
        }
        return;
      }
      if (event.key === 'u' || event.key === 'U') {
        const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && session.canUndo) {
          event.preventDefault();
          session.undo();
          return;
        }
      }
      if (!event.key.startsWith('Arrow')) return;

      const focusable = Array.from(
        node.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      const here = focusable.indexOf(document.activeElement as HTMLButtonElement);
      if (here < 0) {
        focusable[0]?.focus();
        event.preventDefault();
        return;
      }
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = (here + step + focusable.length) % focusable.length;
      focusable[next]?.focus();
      event.preventDefault();
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, session]);

  const opponentSeat = 1 - humanSeat;

  return (
    <div ref={root} className="flex flex-col gap-3">
      <DisplayArea session={session} />
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <PlayerBoard
          board={game.state.players[humanSeat]}
          label={humanLabel}
          active={status === 'idle' || status === 'your-turn'}
          interactive
          session={session}
        />
        <PlayerBoard
          board={game.state.players[opponentSeat]}
          label={opponentLabel}
          active={status === 'ai-thinking'}
          interactive={false}
          session={session}
        />
      </div>
    </div>
  );
}
