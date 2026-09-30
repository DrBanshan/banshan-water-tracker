/**
 * Bottle shapes. One viewBox for all of them so the rising-water math in view.ts stays shared.
 * Each style only contributes geometry: the outline, the water clip region, the decorations
 * drawn on top of the water, and where the water level sits when empty and full.
 *
 * The artwork is data, not markup. What the screen shows is assembled from the same tree that
 * drawBottle returns as text, so the picture and its tests cannot drift apart, and so that
 * mounting it needs no markup string and no HTML sink: a label from settings becomes a text node
 * and nothing is ever parsed as markup.
 *
 * Rules the shapes have to keep, all covered by tests:
 *  - hardware at the neck, such as a swing-top clasp, is drawn as a mirrored pair across the
 *    centre line, so no single stroke can read as a stray mark (the sport bottle once shipped a
 *    blue stroke that looked like a "1");
 *  - a cap or stopper has to overlap the mouth it closes, never float above it;
 *  - a style that draws a solid foot clips the water above it rather than filling through it.
 */
export interface BottleStyle {
  id: string;
  name: string;
  body: string;
  /** Region the water is clipped to; defaults to the outline. Glasses with a solid base narrow
   * it so the water stops at the base instead of appearing to fill through the solid glass. */
  clip?: string;
  decor: Shape[];
  emptyY: number;
  fullY: number;
  tickX: number;
  ticks: 'none' | 'fine' | 'bold';
  rim?: Shape;
  base?: Shape;
}

/** A printed graduation: the volume it stands for, and where on the bottle it lands. */
export interface TickMark {
  fraction: number;
  label: string;
}

export type ShapeAttrs = Record<string, string | number>;

/**
 * One element of the drawing. `text` exists so a label can be data too; children are always
 * elements, never strings, which is what keeps anything resembling markup out of this file.
 */
export interface Shape {
  tag: string;
  attrs?: ShapeAttrs;
  children?: Shape[];
  text?: string;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

const path = (d: string, className?: string): Shape => ({
  tag: 'path',
  attrs: className === undefined ? { d } : { class: className, d },
});

const rect = (className: string, x: number, y: number, width: number, height: number, rx: number): Shape => ({
  tag: 'rect',
  attrs: { class: className, x, y, width, height, rx },
});

const group = (attrs: ShapeAttrs, ...children: Shape[]): Shape => ({ tag: 'g', attrs, children });

const shine = (x: number, from: number, to: number): Shape => path(`M${x} ${from} L${x} ${to}`, 'wt-shine');

const CAP_SLIM: Shape[] = [
  rect('wt-cap', 45, 8, 30, 17, 4),
  rect('wt-cap wt-cap-ring', 42, 24, 36, 9, 4),
];

const CAP_SPORT: Shape[] = [
  path('M52 32 Q52 12 60 12 Q68 12 68 32', 'wt-loop'),
  rect('wt-cap', 43, 30, 34, 22, 7),
  rect('wt-cap wt-cap-ring', 41, 48, 38, 8, 4),
];

export const BOTTLE_STYLES: BottleStyle[] = [
  {
    id: 'slim',
    name: 'Slim glass bottle',
    body:
      'M46 33 L74 33 L74 45 C74 55 88 60 88 80 L88 194 Q88 212 70 212 L50 212 Q32 212 32 194 L32 80 C32 60 46 55 46 45 Z',
    decor: [...CAP_SLIM, shine(40, 96, 178)],
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
    decor: [
      rect('wt-stopper', 47, 18, 26, 18, 5),
      // The swing top's clasp: a seat ring on the neck and a mirrored cage over the stopper.
      path('M41 42 L79 42', 'wt-wire'),
      path('M44 44 L44 20 M76 44 L76 20 M44 20 L76 20', 'wt-wire'),
      shine(30, 108, 176),
      shine(90, 108, 176),
    ],
    base: path('M24 186 L96 186', 'wt-base'),
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
    decor: [...CAP_SPORT, shine(40, 100, 180)],
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
    decor: [shine(24.3, 116, 190.6), shine(95.7, 116, 190.6)],
    base: path('M21.3 203.1 C21.3 200.6 40.6 198.6 60 198.6 C79.4 198.6 98.7 200.6 98.7 203.1', 'wt-base'),
    rim: path('M13 103.5 C13 101.8 37.9 98 60 98 C82.1 98 107 101.8 107 103.5', 'wt-rim'),
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

function tickMarks(style: BottleStyle, ticks: TickMark[]): Shape[] {
  if (style.ticks === 'none') return [];
  const width = style.ticks === 'bold' ? 12 : 8;
  const out: Shape[] = [];
  for (const tick of ticks) {
    if (!(tick.fraction > 0) || tick.fraction >= 1) continue;
    // The rounding is part of the geometry: the label is placed from the same tenth of a pixel
    // the line is drawn at, so the two can never sit half apart.
    const y = Number(waterLevelY(style, tick.fraction).toFixed(1));
    out.push(
      path(`M${style.tickX} ${y.toFixed(1)} L${style.tickX - width} ${y.toFixed(1)}`, `wt-tick wt-tick-${style.ticks}`),
      {
        tag: 'text',
        attrs: { class: 'wt-tick-label', x: style.tickX - width - 3, y: (y + 3.5).toFixed(1), 'text-anchor': 'end' },
        text: tick.label,
      },
    );
  }
  return out;
}

/**
 * The whole drawing, as data. The screen mounts this tree and tests read its text form, so there
 * is one artwork and two ways of looking at it.
 */
export function bottleTree(style: BottleStyle, uid: string, ticks: TickMark[]): Shape {
  return {
    tag: 'svg',
    attrs: { class: 'wt-svg', viewBox: '0 0 120 224', 'aria-hidden': 'true' },
    children: [
      {
        tag: 'defs',
        children: [
          {
            tag: 'clipPath',
            attrs: { id: `wt-clip-${uid}` },
            children: [path(style.clip ?? style.body)],
          },
        ],
      },
      group({ class: 'wt-back' }, path(style.body, 'wt-glass')),
      group(
        { 'clip-path': `url(#wt-clip-${uid})` },
        group({ class: 'wt-water', transform: `translate(0 ${waterLevelY(style, 0)})` }, path(WAVE, 'wt-wave wt-wave-back'), path(WAVE, 'wt-wave wt-wave-front')),
      ),
      ...(style.base === undefined ? [] : [style.base]),
      ...tickMarks(style, ticks),
      ...style.decor,
      ...(style.rim === undefined ? [] : [style.rim]),
    ],
  };
}

// One escaper for both jobs. The quote is harmless in text and necessary in an attribute, and a
// single pass over the characters that matter means an escaped & cannot be escaped twice.
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const escapeMarkup = (value: string): string =>
  value.replace(/[&<>"]/g, (character) => ESCAPES[character] ?? character);

/** Text form of a tree, attributes in the order they were given. */
export function serializeShape(shape: Shape): string {
  const attrs = shape.attrs === undefined ? '' : serializeAttrs(shape.attrs);
  if (shape.text !== undefined) return `<${shape.tag}${attrs}>${escapeMarkup(shape.text)}</${shape.tag}>`;
  if (shape.children === undefined || shape.children.length === 0) return `<${shape.tag}${attrs}/>`;
  return `<${shape.tag}${attrs}>${shape.children.map(serializeShape).join('')}</${shape.tag}>`;
}

function serializeAttrs(attrs: ShapeAttrs): string {
  let out = '';
  for (const [name, value] of Object.entries(attrs)) out += ` ${name}="${escapeMarkup(String(value))}"`;
  return out;
}

/**
 * Mount a tree under a real element. Attributes go through setAttribute and labels through
 * textContent, so there is no string anywhere in this path that anything could parse as markup.
 */
export function mountShape(parent: Element, shape: Shape): void {
  const element = document.createElementNS(SVG_NS, shape.tag);
  if (shape.attrs !== undefined) {
    for (const [name, value] of Object.entries(shape.attrs)) element.setAttribute(name, String(value));
  }
  if (shape.text !== undefined) element.textContent = shape.text;
  for (const child of shape.children ?? []) mountShape(element, child);
  parent.append(element);
}

/** Graduation labels come from the caller, so they always speak the user's unit. */
export function drawBottle(style: BottleStyle, uid: string, ticks: TickMark[]): string {
  return serializeShape(bottleTree(style, uid, ticks));
}
