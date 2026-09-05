const MODES = new Set(['choropleth', 'bubble']);
const PALETTES = new Set(['blue-a', 'orange-a', 'mixed-c']);
const AUTOMATIC_METHODS = new Set(['auto', 'equal', 'quantile', 'jenks']);
const CLASS_COUNTS = new Set([3, 4, 5, 6, 7]);

/** Validate presentation choices that must be explicitly confirmed before V1.2 rendering. */
export function validatePresentationConfig(config) {
  if (!config || typeof config !== 'object') migrationError('mode');
  if (!Object.hasOwn(config, 'mode')) migrationError('mode');
  if (!MODES.has(config.mode)) throw new Error('V1.2 mode must be choropleth or bubble');
  if (!Object.hasOwn(config, 'paletteId')) migrationError('paletteId');
  if (!PALETTES.has(config.paletteId)) throw new Error('V1.2 paletteId must be blue-a, orange-a, or mixed-c');
  if (!Object.hasOwn(config, 'classes')) migrationError('classes');
  if (!CLASS_COUNTS.has(config.classes)) throw new Error('V1.2 classes must be one of 3, 4, 5, 6, or 7');
  if (!Object.hasOwn(config, 'classification')) migrationError('classification');
  const classification = config.classification;
  if (!classification || typeof classification !== 'object') migrationError('classification');
  if (!Object.hasOwn(classification, 'method')) migrationError('classification.method');
  if (!Object.hasOwn(classification, 'source')) migrationError('classification.source');
  if (classification.method === 'custom') {
    if (classification.source !== 'user-defined') throw new Error('V1.2 custom classification source must be user-defined');
    validateThresholdShape(classification.thresholds, config.classes);
  } else {
    if (!AUTOMATIC_METHODS.has(classification.method)) throw new Error('V1.2 classification.method must be auto, equal, quantile, jenks, or custom');
    if (classification.source !== 'user-confirmed') throw new Error('V1.2 automatic classification source must be user-confirmed');
    if (Object.hasOwn(classification, 'thresholds')) throw new Error('V1.2 automatic classification must not include thresholds');
  }
}

function validateThresholdShape(thresholds, classes) {
  if (!Array.isArray(thresholds) || thresholds.length !== classes) throw new Error(`V1.2 custom classification requires exactly ${classes} thresholds`);
  if (thresholds.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('V1.2 custom thresholds must be finite numbers');
  if (thresholds.some((value, index) => index > 0 && value <= thresholds[index - 1])) throw new Error('V1.2 custom thresholds must be strictly increasing');
}

function migrationError(field) {
  throw new Error(`V1.2 migration required: provide explicit ${field}`);
}
