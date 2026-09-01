import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { storage } from '../storage';

export type GameStyle = 'focus' | 'normal' | 'classic';

export interface StyleOption {
  value: GameStyle;
  label: string;
  description: string;
}

export const GAME_STYLES: readonly StyleOption[] = [
  {
    value: 'focus',
    label: 'Focus',
    description: 'Subtle colors, letter initials, no avatars/badges.',
  },
  {
    value: 'normal',
    label: 'Normal',
    description: 'Vibrant tiles, color-coded user icons, clean layout.',
  },
  {
    value: 'classic',
    label: 'Classic',
    description: 'Vibrant tiles, AI robot badges, and board watermark badge.',
  },
] as const;

interface GameStyleContextValue {
  style: GameStyle;
  setStyle: (next: GameStyle) => void;
}

const GameStyleContext = createContext<GameStyleContextValue>({
  style: 'classic',
  setStyle: () => {},
});

export function GameStyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<GameStyle>(() => {
    const saved = storage.gameStyle();
    if (saved === 'focus' || saved === 'normal' || saved === 'classic') {
      return saved;
    }
    return 'classic';
  });

  const setStyle = useCallback((next: GameStyle) => {
    setStyleState(next);
    storage.setGameStyle(next);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-game-style', style);
  }, [style]);

  return (
    <GameStyleContext.Provider value={{ style, setStyle }}>
      {children}
    </GameStyleContext.Provider>
  );
}

export function useGameStyle() {
  return useContext(GameStyleContext);
}
