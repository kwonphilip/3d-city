// Fills in the fields every preset carries but most don't vary.
// Spreading after the caller's preset lets any explicit value win.
export function defineStyle(preset) {
  return { postFx: null, glowColor: null, stars: false, ...preset }
}
