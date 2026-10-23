/* Editorial estimates of active making time; no pattern content is exposed.
   Ranges include crocheting, color changes, stuffing and assembly.
   Calibrated for a hobby crocheter familiar with the stitches, not a speed crocheter.
   These are planning ranges, not a guarantee or an automatic timer. */
(() => {
  'use strict';

  const ESTIMATES = Object.freeze({
    'snugglebeans-baby-night-dragon-sploot': {min: 7, max: 12},
    'mrsgeegees-luna-the-druid': {min: 18, max: 30},
    'sambrosis-tooth': {min: 3, max: 5},
    'frauskau-pooh-snuggler': {min: 7, max: 12},
    'krochet-by-kris-easter-bunny-bundle': {min: 16, max: 26},
    'oakandmarlow-plush-mermaid-mod': {min: 2, max: 4},
    'sweetpeaplush-baby-boba-bunny': {min: 5, max: 9},
    'thewhimsywhale-donut-kitty': {min: 3, max: 6},
    'huniebeecrafts-baby-appa': {min: 12, max: 18},
    'oakandmarlow-brie-mouse': {min: 4, max: 7},
    'annie-carraway-cute-loaf-cat': {
      solid: {min: 2, max: 4},
      spotted: {min: 3, max: 5}
    }
  });

  function estimateFor(pattern, progress = {}) {
    if (!pattern || typeof pattern.id !== 'string') return null;
    const entry = ESTIMATES[pattern.id];
    if (!entry) return null;
    const estimate = entry.min !== undefined
      ? entry
      : entry[progress?.variantOption === 'spotted' ? 'spotted' : 'solid'];
    if (!estimate || !Number.isFinite(estimate.min) || !Number.isFinite(estimate.max)) return null;
    return {min: estimate.min, max: estimate.max};
  }

  function estimateTime(pattern, progress = {}) {
    const range = estimateFor(pattern, progress);
    if (!range) return null;
    return `${range.min}–${range.max} hours`;
  }

  window.SunbeamEstimates = Object.freeze({estimateFor, estimateTime});
})();
