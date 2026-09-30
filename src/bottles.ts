/**
 * Bottle shapes. One viewBox for all of them so the rising-water math in view.ts stays shared.
 * Each style only contributes geometry: the outline, the water clip region, the decorations
 * drawn on top of the water, and where the water level sits when empty and full.
 *
 * Rules the shapes have to keep, all covered by tests:
 *  - anything drawn at the neck is mirrored across the centre line, so no stroke can read as
 *    a stray mark (the sport bottle once shipped a blue stroke that looked like a "1");
 *  - a cap or stopper has to overlap the mouth it closes, never float above it;
 *  - hardware at the neck, such as a swing-top clasp, is drawn as a mirrored pair, so no
 *    single stroke can read as a stray mark (the sport bottle once shipped a blue stroke
 *    that looked like a "1");
 *  - a style that draws a solid foot clips the water above it rather than filling through it.
 */
export interface BottleStyle {
  id: string;
  name: string;
  body: string;
  /** Region the water is clipped to; defaults to the outline. Glasses with a solid base narrow
   * it so the water stops at the base instead of appearing to fill through the solid glass. */
  clip?: string;
  decor: string;
  emptyY: number;
  fullY: number;
  tickX: number;
  ticks: 'none' | 'fine' | 'bold';
  rim?: string;
  base?: string;
}

/** A printed graduation: the volume it stands for, and where on the bottle it lands. */
export interface TickMark {
  fraction: number;
  label: string;
}

const CAP_SLIM =
  '<rect class="wt-cap" x="45" y="8" width="30" height="17" rx="4"/>' +
  '<rect class="wt-cap wt-cap-ring" x="42" y="24" width="36" height="9" rx="4"/>';

const CAP_SPORT =
  '<path class="wt-loop" d="M52 32 Q52 12 60 12 Q68 12 68 32"/>' +
  '<rect class="wt-cap" x="43" y="30" width="34" height="22" rx="7"/>' +
  '<rect class="wt-cap wt-cap-ring" x="41" y="48" width="38" height="8" rx="4"/>';

export const BOTTLE_STYLES: BottleStyle[] = [
  {
    id: 'slim',
    name: 'Slim glass bottle',
    body:
      'M46 33 L74 33 L74 45 C74 55 88 60 88 80 L88 194 Q88 212 70 212 L50 212 Q32 212 32 194 L32 80 C32 60 46 55 46 45 Z',
    decor: CAP_SLIM + '<path class="wt-shine" d="M40 96 L40 178"/>',
    emptyY: 214,
    fullY: 40,
    tickX: 82,
    ticks: 'fine',
  },
  {
    id: 'round',
    name: 'Round flask',
    // Straight-mouthed bottle: a flat open mouth, a short straight neck, a rounded shoulder,
    // parallel sides, a solid base. A pale stopper sits in the mouth, nothing else.
    body:
      'M43 32 L77 32 L77 56 C92 62 98 74 98 96 L98 188 Q98 206 80 206 L40 206 Q22 206 22 188 L22 96 C22 74 28 62 43 56 Z',
    decor:
      '<rect class="wt-stopper" x="47" y="18" width="26" height="18" rx="5"/>' +
      // The swing top's clasp: a seat ring on the neck and a mirrored cage over the stopper.
      '<path class="wt-wire" d="M41 42 L79 42"/>' +
      '<path class="wt-wire" d="M44 44 L44 20 M76 44 L76 20 M44 20 L76 20"/>' +
      '<path class="wt-shine" d="M30 108 L30 176"/>' +
      '<path class="wt-shine" d="M90 108 L90 176"/>',
    base: '<path class="wt-base" d="M24 186 L96 186"/>',
    emptyY: 212,
    fullY: 60,
    tickX: 92,
    ticks: 'fine',
  },
  {
    id: 'sport',
    name: 'Sport bottle',
    body:
      'M46 52 L74 52 L74 66 C84 70 88 78 88 92 L88 192 Q88 212 68 212 L52 212 Q32 212 32 192 L32 92 C32 78 36 70 46 66 Z',
    decor: CAP_SPORT + '<path class="wt-shine" d="M40 100 L40 180"/>',
    emptyY: 214,
    fullY: 62,
    tickX: 82,
    ticks: 'bold',
  },
  {
    id: 'tumbler',
    name: 'Flat glass',
    // The reference glass, kept as it was drawn: a mouth seen as an ellipse, walls easing
    // inward by the same eighth, and a foot that rolls over as an ellipse of its own. Only the
    // palette is ours now, so it reads with the rest of the shelf.
    body:
      'M60 109.1 C34 109.1 13 108.2 13 103.5 L21.3 203.1 C21.3 206.2 43.2 208.6 60 208.6 C76.8 208.6 98.7 206.2 98.7 203.1 L107 103.5 C107 108.2 86 109.1 60 109.1 Z',
    decor:
      '<path class="wt-shine" d="M24.3 116 L24.3 190.6"/>' +
      '<path class="wt-shine" d="M95.7 116 L95.7 190.6"/>',
    base: '<path class="wt-base" d="M21.3 203.1 C21.3 200.6 40.6 198.6 60 198.6 C79.4 198.6 98.7 200.6 98.7 203.1"/>',
    rim: '<path class="wt-rim" d="M13 103.5 C13 101.8 37.9 98 60 98 C82.1 98 107 101.8 107 103.5"/>',
    emptyY: 214,
    fullY: 104,
    tickX: 96,
    ticks: 'none',
  },
];

export function bottleById(id: string): BottleStyle {
  return BOTTLE_STYLES.find((style) => style.id === id) ?? BOTTLE_STYLES[0];
}

const WAVE =
  'M0 14 Q15 2 30 14 T60 14 T90 14 T120 14 T150 14 T180 14 T210 14 T240 14 T270 14 T300 14 L300 320 L0 320 Z';

export function waterLevelY(style: BottleStyle, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return style.emptyY - clamped * (style.emptyY - style.fullY);
}

const RUNGS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10];

/** Round a raw step down to something a person would print on glass: 625 becomes 600. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / magnitude;
  let best = RUNGS[0];
  let gap = Math.abs(unit - best);
  for (const rung of RUNGS) {
    const distance = Math.abs(unit - rung);
    if (distance < gap) {
      best = rung;
      gap = distance;
    }
  }
  return Math.max(10, Math.round(magnitude * best));
}

/**
 * Three graduations for a daily goal, each one a round number, spaced by that number rather
 * than by exact quarters: a 2500 goal prints 600, 1200 and 1800. A tick is dropped rather
 * than drawn past the top of the bottle.
 */
export function tickValues(goalMl: number): { ml: number; fraction: number }[] {
  const goal = Math.max(1, Math.round(goalMl));
  const step = niceStep(goal / 4);
  const marks: { ml: number; fraction: number }[] = [];
  if (step <= 0) return marks;
  for (let multiple = 1; multiple <= 3; multiple += 1) {
    const ml = step * multiple;
    if (ml > goal) break;
    marks.push({ ml, fraction: ml / goal });
  }
  return marks;
}

function tickMarks(style: BottleStyle, ticks: TickMark[]): string {
  if (style.ticks === 'none') return '';
  const width = style.ticks === 'bold' ? 12 : 8;
  const out: string[] = [];
  for (const tick of ticks) {
    if (!(tick.fraction > 0) || tick.fraction >= 1) continue;
    const y = waterLevelY(style, tick.fraction).toFixed(1);
    out.push(
      `<path class="wt-tick wt-tick-${style.ticks}" d="M${style.tickX} ${y} L${style.tickX - width} ${y}"/>`,
      `<text class="wt-tick-label" x="${style.tickX - width - 3}" y="${(Number(y) + 3.5).toFixed(1)}" text-anchor="end">${tick.label}</text>`,
    );
  }
  return out.join('');
}

/** Graduation labels come from the caller, so they always speak the user's unit. */
export function drawBottle(style: BottleStyle, uid: string, ticks: TickMark[]): string {
  return [
    '<svg class="wt-svg" viewBox="0 0 120 224" aria-hidden="true">',
    `<defs><clipPath id="wt-clip-${uid}"><path d="${style.clip ?? style.body}"/></clipPath></defs>`,
    '<g class="wt-back">',
    `<path class="wt-glass" d="${style.body}"/>`,
    '</g>',
    `<g clip-path="url(#wt-clip-${uid})">`,
    `<g class="wt-water" transform="translate(0 ${waterLevelY(style, 0)})">`,
    `<path class="wt-wave wt-wave-back" d="${WAVE}"/>`,
    `<path class="wt-wave wt-wave-front" d="${WAVE}"/>`,
    '</g></g>',
    style.base ?? '',
    tickMarks(style, ticks),
    style.decor,
    style.rim ?? '',
    '</svg>',
  ].join('');
}
