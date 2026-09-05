import { validatePresentationConfig } from './presentation-config.mjs';

export function createMapJob({ input, mode, classes, classification, paletteId }) {
  validatePresentationConfig({ mode, classes, classification, paletteId });
  if (mode === 'bubble' && input.rows.some(({ value }) => value < 0)) throw new Error('negative values are not supported in bubble mode');
  return {
    ...input,
    mode,
    classes,
    classification: { ...classification },
    paletteId,
  };
}

