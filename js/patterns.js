/* Safe HTML/image helpers and pure crochet pattern selectors. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg class="small-icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const safeImage = src => typeof src === 'string' &&
    (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(src) ||
     /^assets\/[a-zA-Z0-9_.\/-]+$/.test(src)) ? src : '';
  const picture = (pattern, key) => safeImage(pattern?.images?.[key] || '');
  function validPattern(p) {
    return p && typeof p.id === 'string' && /^[a-z0-9-]{2,80}$/.test(p.id) &&
      typeof p.title === 'string' && Array.isArray(p.groups) &&
      p.groups.every(g => Array.isArray(g.steps));
  }
  function stepsFor(p, state) {
    return p.groups.flatMap(g => g.steps
      .filter(s => (!s.option || String(s.option) === String(state.earOption)) && (!s.variant || String(s.variant) === String(state.variantOption || 'solid')))
      .map(s => ({...s, groupId: g.id, groupTitle: g.title})));
  }
  function groupSteps(p, g, state) {
    return g.steps.filter(s => (!s.option || String(s.option) === String(state.earOption)) && (!s.variant || String(s.variant) === String(state.variantOption || 'solid')));
  }
  function stats(p, state) {
    const steps = stepsFor(p, state);
    const completed = steps.filter(step => state.done[step.id]).length;
    return {total: steps.length, complete: completed,
      percent: steps.length ? Math.round(completed / steps.length * 100) : 0};
  }
  window.SunbeamPatterns = Object.freeze({
    esc, icon, safeImage, picture, validPattern, stepsFor, groupSteps, stats
  });
})();
