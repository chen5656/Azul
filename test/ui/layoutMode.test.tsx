import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLayoutMode } from '../../src/components/useLayoutMode';

function stubMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return mql;
}

describe('useLayoutMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the wide shell only when the viewport is both wide and tall', () => {
    stubMatchMedia(true);
    expect(renderHook(() => useLayoutMode()).result.current).toBe('wide');
  });

  it('falls back to the stacked shell otherwise — a landscape phone included', () => {
    stubMatchMedia(false);
    expect(renderHook(() => useLayoutMode()).result.current).toBe('stacked');
  });

  it('queries on width and height together', () => {
    stubMatchMedia(true);
    renderHook(() => useLayoutMode());
    const query = (matchMedia as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(query).toMatch(/min-width/);
    expect(query).toMatch(/min-height/);
  });
});
