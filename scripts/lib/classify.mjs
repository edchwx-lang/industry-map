import { ckmeans } from 'simple-statistics';

/** Classify finite numeric values using deterministic sorted breaks. */
export function classifyValues(values, { classes = 5, method = 'auto', breaks, thresholds, source } = {}) {
  const numbers = values.filter(value => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!numbers.length) throw new Error('At least one finite numeric value is required');
  if (![3, 4, 5, 6, 7].includes(classes)) throw new Error('classes must be an integer from 3 through 7');
  let selected = method;
  let resolvedBreaks;
  let classCounts;
  if (method === 'custom') {
    validateThresholds(thresholds, classes, numbers);
    return {
      method: 'custom',
      source: source ?? 'user-defined',
      intervalSemantics: 'left-closed-right-open',
      classes,
      thresholds: [...thresholds],
      classCounts: countThresholdClasses(numbers, thresholds),
      rationale: 'User-supplied left-closed/right-open thresholds preserved exactly; the final class is open-ended.',
    };
  }
  if (breaks) {
    resolvedBreaks = [...breaks];
  } else {
    if (selected === 'auto') selected = hasRepeatedValues(numbers) ? 'quantile' : 'equal';
    if (selected === 'equal') resolvedBreaks = equalBreaks(numbers, classes);
    else if (selected === 'quantile') resolvedBreaks = quantileBreaks(numbers, classes);
    else if (selected === 'jenks') {
      const jenks = jenksClassification(numbers, classes);
      resolvedBreaks = jenks.breaks;
      classCounts = jenks.classCounts;
    } else invalidMethod(method);
  }
  validateBreaks(resolvedBreaks, classes);
  return {
    method: selected,
    source: source ?? 'user-confirmed',
    intervalSemantics: 'left-closed-right-open',
    classes,
    breaks: resolvedBreaks,
    classCounts: classCounts ?? countClasses(numbers, resolvedBreaks),
    rationale: selected === 'equal' ? 'Equal intervals selected for an evenly spaced distribution.'
      : selected === 'quantile' ? 'Quantiles selected to balance repeated or skewed values.'
      : selected === 'jenks' ? 'Jenks/ckmeans selected to minimize within-class variance.'
      : breaks ? 'User-supplied automatic break endpoints preserved exactly.' : 'Classification resolved.',
  };
}

function countThresholdClasses(numbers, thresholds) {
  const counts = Array(thresholds.length).fill(0);
  for (const value of numbers) {
    let index = thresholds.length - 1;
    for (let candidate = 0; candidate < thresholds.length - 1; candidate += 1) {
      if (value < thresholds[candidate + 1]) { index = candidate; break; }
    }
    counts[index] += 1;
  }
  return counts;
}

function equalBreaks(numbers, classes) {
  const min = numbers[0];
  const step = (numbers.at(-1) - min) / classes;
  return Array.from({ length: classes + 1 }, (_, index) => tidy(min + step * index));
}
function quantileBreaks(numbers, classes) {
  return Array.from({ length: classes + 1 }, (_, index) => numbers[Math.min(numbers.length - 1, Math.floor(index * (numbers.length - 1) / classes))]);
}
function jenksClassification(numbers, classes) {
  const groups = ckmeans(numbers, Math.min(classes, new Set(numbers).size));
  const edges = [groups[0][0], ...groups.map(group => group.at(-1))];
  while (edges.length < classes + 1) edges.splice(edges.length - 1, 0, edges.at(-2));
  const classCounts = groups.map(group => group.length);
  while (classCounts.length < classes) classCounts.push(0);
  return { breaks: edges, classCounts };
}
function countClasses(numbers, breaks) {
  const counts = Array(breaks.length - 1).fill(0);
  for (const value of numbers) {
    let index = breaks.length - 2;
    for (let candidate = 0; candidate < breaks.length - 2; candidate += 1) {
      if (value < breaks[candidate + 1]) { index = candidate; break; }
    }
    counts[index] += 1;
  }
  return counts;
}
function hasRepeatedValues(numbers) { return new Set(numbers).size < numbers.length; }
function tidy(value) { return Number(value.toFixed(12)); }
function validateBreaks(breaks, classes) {
  if (!Array.isArray(breaks) || breaks.length !== classes + 1 || breaks.some((value, index) => !Number.isFinite(value) || (index && value < breaks[index - 1]))) throw new Error(`breaks must contain ${classes + 1} sorted finite numbers`);
}
function validateThresholds(thresholds, classes, numbers) {
  if (!Array.isArray(thresholds) || thresholds.length !== classes) throw new Error(`custom classification requires exactly ${classes} thresholds`);
  if (thresholds.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('custom thresholds must be finite numbers');
  if (thresholds.some((value, index) => index > 0 && value <= thresholds[index - 1])) throw new Error('custom thresholds must be strictly increasing');
  if (numbers[0] >= 0 && thresholds[0] !== 0) throw new Error('custom thresholds for nonnegative data must start at 0');
  if (thresholds[0] > numbers[0]) throw new Error('custom thresholds must cover the minimum data value');
}
function invalidMethod(method) { throw new Error(`Unsupported classification method: ${method}`); }
