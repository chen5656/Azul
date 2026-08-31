import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGameSession } from '../../src/game/useGameSession';
import { QuadroGame } from '../../src/engine';

describe('useGameSession undo functionality', () => {
  it('allows undoing up to 3 times per game by default', async () => {
    const { result } = renderHook(() =>
      useGameSession({
        newGame: () => new QuadroGame(42, 0),
        ai: { level: 'easy' },
        humanSeat: 0,
        timed: false,
      }),
    );

    expect(result.current.undosRemaining).toBe(3);
    expect(result.current.maxUndos).toBe(3);
    expect(result.current.canUndo).toBe(false);

    // Make a move
    const legal = result.current.game.legalActions();
    const move1 = legal[0];
    act(() => {
      result.current.select(move1.source, move1.color);
    });
    act(() => {
      result.current.place(move1.dest);
    });

    await waitFor(() => expect(result.current.canUndo).toBe(true));
    expect(result.current.undosRemaining).toBe(3);

    // Undo move 1
    act(() => {
      result.current.undo();
    });

    expect(result.current.undosRemaining).toBe(2);
    expect(result.current.canUndo).toBe(false); // No more history on stack

    // Restart resets undos remaining
    act(() => {
      result.current.restart();
    });
    expect(result.current.undosRemaining).toBe(3);
  });

  it('respects custom maxUndos if passed in options', async () => {
    const { result } = renderHook(() =>
      useGameSession({
        newGame: () => new QuadroGame(42, 0),
        ai: { level: 'easy' },
        humanSeat: 0,
        timed: false,
        maxUndos: 1,
      }),
    );

    expect(result.current.undosRemaining).toBe(1);
    expect(result.current.maxUndos).toBe(1);

    const legal = result.current.game.legalActions();
    const move = legal[0];
    act(() => {
      result.current.select(move.source, move.color);
    });
    act(() => {
      result.current.place(move.dest);
    });

    await waitFor(() => expect(result.current.canUndo).toBe(true));
    act(() => {
      result.current.undo();
    });

    expect(result.current.undosRemaining).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('disables undo once a round is scored', async () => {
    const { result } = renderHook(() =>
      useGameSession({
        newGame: () => new QuadroGame(42, 0),
        ai: { level: 'easy' },
        humanSeat: 0,
        timed: false,
      }),
    );

    // Play until round 1 finishes and round 2 starts
    while (result.current.game.state.round_num === 1 && !result.current.game.isOver()) {
      if (result.current.status === 'your-turn' || result.current.status === 'idle') {
        const legal = result.current.game.legalActions();
        if (legal.length === 0) break;
        const move = legal[0];
        act(() => {
          result.current.select(move.source, move.color);
        });
        act(() => {
          result.current.place(move.dest);
        });
      }
      await waitFor(() => expect(result.current.status).not.toBe('ai-thinking'), {
        timeout: 2000,
      });
    }

    expect(result.current.game.state.round_num).toBe(2);
    // Undo must not work after a round is scored
    expect(result.current.canUndo).toBe(false);
  });
});
