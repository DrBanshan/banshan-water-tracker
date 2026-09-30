export interface WaterSettings {
  /** Vault folder holding one markdown file per month. */
  folder: string;
  /** Daily target in millilitres. */
  goalMl: number;
  /** What one tap of the bottle or one "cup" button adds, in millilitres. */
  cupMl: number;
  /** Quick add buttons, in millilitres. */
  cupPresets: number[];
  /** Display unit only. Everything is stored as millilitres. */
  unit: 'ml' | 'oz';
  /** Which bottle drawing to use. See src/bottles.ts. */
  bottle: string;
}

export const DEFAULT_SETTINGS: WaterSettings = {
  folder: 'Water Tracker',
  goalMl: 2000,
  cupMl: 250,
  cupPresets: [150, 250, 500],
  unit: 'ml',
  bottle: 'slim',
};

export interface Drink {
  /** Local wall clock time the cup was tapped, HH:mm. */
  time: string;
  /** Amount drunk, millilitres. */
  ml: number;
}
