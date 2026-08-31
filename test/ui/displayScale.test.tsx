import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisplayScaleControl } from '../../src/components/DisplayScaleControl';
import { storage } from '../../src/storage';

describe('DisplayScaleControl', () => {
  beforeEach(() => {
    try {
      window.localStorage.clear?.();
    } catch {
      // ignore
    }
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    cleanup();
    const root = document.getElementById('root');
    if (root) document.body.removeChild(root);
  });

  it('defaults to 100% when no storage preference exists', () => {
    render(<DisplayScaleControl />);
    const select = screen.getByLabelText('Display Scale') as HTMLSelectElement;
    expect(select.value).toBe('100');
  });

  it('loads saved scale from localStorage', () => {
    storage.setDisplayScale('85');
    render(<DisplayScaleControl />);
    const select = screen.getByLabelText('Display Scale') as HTMLSelectElement;
    expect(select.value).toBe('85');
  });

  it('saves new scale to localStorage when user changes selection', () => {
    render(<DisplayScaleControl />);
    const select = screen.getByLabelText('Display Scale') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '80' } });
    expect(select.value).toBe('80');
    expect(storage.displayScale()).toBe('80');
  });
});
