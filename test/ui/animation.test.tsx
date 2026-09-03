import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameSession } from '../../src/game/useGameSession';
import { createAnimator } from '../../src/components/animator';
import { QuadroGame } from '../../src/engine';

describe('Gameplay Animations', () => {
  it('disables animations in focus style', () => {
    const rootRef = { current: document.createElement('div') };
    const animator = createAnimator(rootRef, 'focus');
    expect(animator.isEnabled()).toBe(false);
  });

  it('enables animations in classic and normal styles when reduced motion is off', () => {
    const rootRef = { current: document.createElement('div') };
    const classicAnimator = createAnimator(rootRef, 'classic');
    const normalAnimator = createAnimator(rootRef, 'normal');
    expect(classicAnimator.isEnabled()).toBe(true);
    expect(normalAnimator.isEnabled()).toBe(true);
  });

  it('animator methods resolve safely without error even without rendered DOM layout', async () => {
    const rootRef = { current: document.createElement('div') };
    const animator = createAnimator(rootRef, 'classic');

    await expect(animator.flyTile(0, 'fac-0-0-0', 'stage-0-0-0')).resolves.toBeUndefined();
    await expect(animator.fadeOut(['stage-0-0-0'])).resolves.toBeUndefined();
    await expect(animator.streakLine(['wall-0-0-0', 'wall-0-0-1', 'wall-0-0-2'])).resolves.toBeUndefined();
    expect(() => animator.popScore('+5', 'wall-0-0-0', true)).not.toThrow();
    expect(() => animator.popIn(['wall-0-0-0'])).not.toThrow();
    expect(() => animator.conceal(['wall-0-0-0'])()).not.toThrow();
    expect(() => animator.clear()).not.toThrow();
  });

  it('normalizes overlay coordinates when the board is displayed at 85%', async () => {
    const root = document.createElement('div');
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.dataset.animId = 'wall-0-0-0';
    second.dataset.animId = 'wall-0-0-1';
    root.append(first, second);

    Object.defineProperties(root, {
      offsetWidth: { configurable: true, value: 1000 },
      offsetHeight: { configurable: true, value: 800 },
    });
    root.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 850, height: 680 } as DOMRect);
    first.getBoundingClientRect = () =>
      ({ left: 610, top: 220, width: 34, height: 34 } as DOMRect);
    second.getBoundingClientRect = () =>
      ({ left: 652.5, top: 220, width: 34, height: 34 } as DOMRect);

    const animations: Array<{ onfinish: null | (() => void) }> = [];
    const stubAnimate = () => {
      const animation = { onfinish: null as null | (() => void) };
      animations.push(animation);
      return animation as Animation;
    };
    const animateDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'animate');
    Object.defineProperty(SVGElement.prototype, 'animate', { configurable: true, value: stubAnimate });
    try {
      const animator = createAnimator({ current: root }, 'classic');
      const done = animator.streakLine(['wall-0-0-0', 'wall-0-0-1']);
      const path = root.querySelector('path');

      // Visual centers 527px and 569.5px from the root become local centers
      // 620px and 670px after dividing out the 0.85 display scale.
      expect(path?.getAttribute('d')).toBe('M 620 220 L 670 220');

      animations.at(-1)?.onfinish?.();
      await done;
    } finally {
      if (animateDescriptor) {
        Object.defineProperty(SVGElement.prototype, 'animate', animateDescriptor);
      } else {
        delete (SVGElement.prototype as unknown as { animate?: typeof stubAnimate }).animate;
      }
    }
  });

  it('useGameSession integrates with animator for drafting and settlement', async () => {
    const { result } = renderHook(() =>
      useGameSession({
        newGame: () => new QuadroGame(42, 0),
        ai: { level: 'easy' },
        humanSeat: 0,
        timed: false,
      }),
    );

    const flySpy = vi.fn().mockResolvedValue(undefined);
    const animator = {
      flyTile: flySpy,
      popScore: vi.fn(),
      fadeOut: vi.fn().mockResolvedValue(undefined),
      popIn: vi.fn(),
      streakLine: vi.fn().mockResolvedValue(undefined),
      conceal: vi.fn().mockReturnValue(() => {}),
      clear: vi.fn(),
      isEnabled: () => true,
    };

    act(() => {
      result.current.setAnimator?.(animator);
    });

    const legal = result.current.game.legalActions();
    const move = legal[0];

    act(() => {
      result.current.select(move.source, move.color);
    });

    await act(async () => {
      await result.current.place(move.dest);
    });

    expect(flySpy).toHaveBeenCalled();
  });

  it('animates end-of-game bonus sequence with incremental score ticks', async () => {
    const { animateSettlement } = await import('../../src/components/animator');
    const view = new QuadroGame(42, 0).state;
    // Set up human board with full row 0, full column 1, full color 2
    for (let c = 0; c < 5; c += 1) view.players[0].grid[0][c] = true;
    for (let r = 0; r < 5; r += 1) view.players[0].grid[r][1] = true;
    for (let r = 0; r < 5; r += 1) view.players[0].grid[r][(2 + r) % 5] = true;
    view.players[0].score = 40;
    for (let c = 0; c < 5; c += 1) view.players[1].grid[4][c] = true;
    view.players[1].score = 30;

    const recordedScores: number[] = [];
    const streakSpy = vi.fn().mockResolvedValue(undefined);
    const popScoreSpy = vi.fn();
    const animator = {
      flyTile: vi.fn().mockResolvedValue(undefined),
      popScore: popScoreSpy,
      fadeOut: vi.fn().mockResolvedValue(undefined),
      popIn: vi.fn(),
      streakLine: streakSpy,
      conceal: vi.fn().mockReturnValue(() => {}),
      clear: vi.fn(),
      isEnabled: () => true,
    };

    const commit = vi.fn().mockImplementation(() => {
      recordedScores.push(view.players[0].score);
    });

    const events = [
      {
        kind: 'bonus' as const,
        player: 0,
        rows: 1,
        columns: 1,
        colors: 1,
        points: 19,
      },
      {
        kind: 'bonus' as const,
        player: 1,
        rows: 1,
        columns: 0,
        colors: 0,
        points: 2,
      },
    ];

    await animateSettlement(animator, events, view, commit);

    // Order of popScore calls should be +2 (row), +7 (col), +10 (color)
    expect(popScoreSpy).toHaveBeenNthCalledWith(1, '+2', expect.any(String), true);
    expect(popScoreSpy).toHaveBeenNthCalledWith(2, '+7', expect.any(String), true);
    expect(popScoreSpy).toHaveBeenNthCalledWith(3, '+10', expect.any(String), true);

    // Both players' scoring grids receive their own bonus streaks.
    expect(streakSpy).toHaveBeenCalledTimes(4);
    expect(streakSpy).toHaveBeenNthCalledWith(
      1,
      ['wall-0-0-0', 'wall-0-0-1', 'wall-0-0-2', 'wall-0-0-3', 'wall-0-0-4'],
      expect.any(Object),
    );
    expect(streakSpy).toHaveBeenNthCalledWith(
      4,
      ['wall-1-4-0', 'wall-1-4-1', 'wall-1-4-2', 'wall-1-4-3', 'wall-1-4-4'],
      expect.any(Object),
    );

    // Check that scores incremented step by step: 40 -> 42 -> 49 -> 59
    expect(recordedScores).toEqual([42, 49, 59, 59]);
    expect(view.players[0].score).toBe(59);
    expect(view.players[1].score).toBe(32);
  });
});

describe('fadeOut cleanup', () => {
  /** jsdom has no Web Animations API, so stand in a minimal Animation. */
  function stubAnimate(node: HTMLElement) {
    const anim = {
      onfinish: null as null | (() => void),
      cancel: vi.fn(),
      finish() {
        this.onfinish?.();
      },
    };
    (node as unknown as { animate: () => typeof anim }).animate = () => anim;
    return anim;
  }

  it('cancels the forwards fill so faded slots render again (settlement leaves no ghosts)', async () => {
    const root = document.createElement('div');
    const slot = document.createElement('div');
    slot.dataset.animId = 'stage-0-4-1';
    root.appendChild(slot);
    const anim = stubAnimate(slot);

    const animator = createAnimator({ current: root }, 'classic');
    const done = animator.fadeOut(['stage-0-4-1']);
    expect(anim.cancel).not.toHaveBeenCalled();

    anim.finish();
    await done;

    // Without this the `fill: 'forwards'` opacity:0 sticks to the DOM node that
    // React reuses for the post-settlement placeholder.
    expect(anim.cancel).toHaveBeenCalledTimes(1);
  });

  it('releases a concealed tile, and self-heals if the caller never releases it', () => {
    const root = document.createElement('div');
    const cell = document.createElement('div');
    cell.dataset.animId = 'wall-0-1-3';
    root.appendChild(cell);
    const anim = stubAnimate(cell);

    const animator = createAnimator({ current: root }, 'classic');
    const reveal = animator.conceal(['wall-0-1-3']);
    reveal();
    expect(anim.cancel).toHaveBeenCalledTimes(1);

    // An aborted turn drops the release; the hold must expire on its own rather
    // than leave the wall cell invisible for the rest of the game.
    const anim2 = stubAnimate(cell);
    animator.conceal(['wall-0-1-3']);
    anim2.finish();
    expect(anim2.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels a still-running fade when the board is cleared', () => {
    const root = document.createElement('div');
    const slot = document.createElement('div');
    slot.dataset.animId = 'floor-0-0';
    root.appendChild(slot);
    const anim = stubAnimate(slot);

    const animator = createAnimator({ current: root }, 'classic');
    void animator.fadeOut(['floor-0-0']);
    animator.clear();

    expect(anim.cancel).toHaveBeenCalledTimes(1);
  });
});
