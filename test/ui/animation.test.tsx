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
    expect(() => animator.popScore('+5', 'wall-0-0-0', true)).not.toThrow();
    expect(() => animator.popIn(['wall-0-0-0'])).not.toThrow();
    expect(() => animator.conceal(['wall-0-0-0'])()).not.toThrow();
    expect(() => animator.clear()).not.toThrow();
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
