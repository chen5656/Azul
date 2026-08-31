import configData from './config.json';

export interface GameConfig {
  maxUndos: number;
}

export const config: GameConfig = {
  maxUndos:
    typeof (configData as { maxUndos?: unknown }).maxUndos === 'number'
      ? ((configData as { maxUndos: number }).maxUndos)
      : 3,
};

export default config;
