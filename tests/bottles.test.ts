import { describe, expect, it } from 'vitest';
import {
  BOTTLE_STYLES,
  bottleById,
  drawBottle,
  niceStep,
  tickValues,
  waterLevelY,
  type Shape,
  type TickMark,
} from '../src/bottles';

const TICKS: TickMark[] = [
  { fraction: 0.24, label: '600' },
  { fraction: 0.48, label: '1200' },
  { fraction: 0.72, label: '1800' },
];

/**
 * The path data a group of shapes is drawn from, walked out of the tree. The alternative is
 * regexing markup, which is the thing the artwork stopped being made of.
 */
function pathData(...shapes: (Shape | undefined)[]): string[] {
  const out: string[] = [];
  const walk = (shape: Shape): void => {
    const d = shape.attrs?.['d'];
    if (typeof d === 'string') {
      out.push(d);
    }
    for (const child of shape.children ?? []) {
      walk(child);
    }
  };
  for (const shape of shapes) {
    if (shape !== undefined) {
      walk(shape);
    }
  }
  return out;
}

/** The rectangles among a style's decorations, as the numbers they were written as. */
function rectsAt(shapes: Shape[]): { x: number; y: number; w: number }[] {
  const out: { x: number; y: number; w: number }[] = [];
  for (const shape of shapes) {
    if (shape.tag !== 'rect') {
      continue;
    }
    out.push({ x: Number(shape.attrs?.['x']), y: Number(shape.attrs?.['y']), w: Number(shape.attrs?.['width']) });
  }
  return out;
}

/** Every number pair in an all-absolute M/L/Q/C path, as [x, y]. */
function pairs(path: string): number[][] {
  const out: number[][] = [];
  const tokens = path.matchAll(/[MLCQVHZ]|-?\d*\.?\d+/g);
  let pending: number | null = null;
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token[0])) {
      if (pending !== null) pending = null;
      continue;
    }
    const value = Number(token[0]);
    if (pending === null) {
      pending = value;
    } else {
      out.push([pending, value]);
      pending = null;
    }
  }
  return out;
}

describe('rising water', () => {
  it('starts at the empty line and reaches the full line', () => {
    for (const style of BOTTLE_STYLES) {
      expect(waterLevelY(style, 0)).toBe(style.emptyY);
      expect(waterLevelY(style, 1)).toBe(style.fullY);
      expect(waterLevelY(style, -1)).toBe(style.emptyY);
      expect(waterLevelY(style, 5)).toBe(style.fullY);
      expect(style.fullY).to.be.lessThan(style.emptyY);
    }
  });

  it('climbs monotonically as more is drunk', () => {
    for (const style of BOTTLE_STYLES) {
      let previous = waterLevelY(style, 0);
      for (let step = 1; step <= 10; step += 1) {
        const y = waterLevelY(style, step / 10);
        expect(y).to.be.lessThan(previous);
        previous = y;
      }
    }
  });

  it('draws the flat glass short and wide, with no solid foot to work around', () => {
    const glass = bottleById('tumbler');
    // A solid foot would need a clip of its own to keep the water out of it; this one has none.
    expect(glass.clip).to.equal(undefined);
    expect(drawBottle(glass, '30', TICKS)).to.not.contain('wt-base-solid');

    const xs = pairs(glass.body).map((pair) => pair[0]);
    const ys = pairs(glass.body).map((pair) => pair[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).to.be.greaterThanOrEqual(70);
    expect(height).to.be.lessThanOrEqual(130);
    expect(width / height).to.be.greaterThanOrEqual(0.7);
  });

  it('draws the flat glass as a squat glass tipped toward the eye', () => {
    const glass = bottleById('tumbler');
    const pts = pairs(glass.body);
    const ys = pts.map((pair) => pair[1]);
    const sole = Math.max(...ys);
    const nearLip = Number(/^M[\d.]+ ([\d.]+)/.exec(glass.body)?.[1]);

    // the mouth is an ellipse: the lip nearest the eye hangs below where the mouth meets the walls
    const shoulders = ys.filter((y) => y < nearLip);
    expect(shoulders.length).to.be.greaterThanOrEqual(2);
    expect(Math.min(...shoulders)).to.be.lessThan(nearLip);

    // and the foot rolls over as an ellipse of its own: its far edge is drawn above the walls,
    // which is how a flat base looks tipped toward the eye, rather than a bowl swelling under it
    expect(glass.base?.tag).to.equal('path');
    const basePts = pairs(pathData(glass.base)[0]);
    const baseTop = Math.min(...basePts.map((pair) => pair[1]));
    const baseEnds = Math.max(...basePts.map((pair) => pair[1]));
    expect(baseTop).to.be.lessThan(baseEnds);
    expect(baseEnds).to.be.lessThan(sole);
    // the far arc springs off the outline itself, not out of thin air
    expect(ys).to.contain(baseEnds);

    expect(glass.emptyY).to.be.greaterThanOrEqual(sole);
    expect(glass.fullY).to.be.greaterThan(Math.min(...ys));
    expect(glass.fullY).to.be.lessThan(sole);
  });

  it('keeps the full level inside its own clip, so the crest is never sliced off', () => {
    for (const style of BOTTLE_STYLES) {
      const clipped = pairs(style.clip ?? style.body);
      const ceiling = Math.min(...clipped.map((pair) => pair[1]));
      const floor = Math.max(...clipped.map((pair) => pair[1]));
      const full = waterLevelY(style, 1);
      // the crest rides 2 above the group's own baseline, so that much headroom is required
      expect(full + 2).to.be.greaterThanOrEqual(ceiling);
      expect(full).to.be.lessThan(floor);
    }
  });

  it('draws every outline symmetric about the centre line', () => {
    for (const style of BOTTLE_STYLES) {
      const xs = pairs(style.body).map((pair) => pair[0]);
      for (const x of xs) {
        const mirror = 120 - x;
        let mirrored = false;
        for (const other of xs) {
          if (Math.abs(other - mirror) < 0.51) mirrored = true;
        }
        expect(mirrored).toBe(true);
      }
    }
  });
});

describe('graduations follow the daily goal', () => {
  it('prints three round marks for a 2500 goal', () => {
    expect(tickValues(2500).map((mark) => mark.ml)).to.eql([600, 1200, 1800]);
  });

  it('keeps the spacing round for other goals', () => {
    expect(tickValues(2000).map((mark) => mark.ml)).to.eql([500, 1000, 1500]);
    expect(tickValues(1000).map((mark) => mark.ml)).to.eql([250, 500, 750]);
    expect(tickValues(3000).map((mark) => mark.ml)).to.eql([750, 1500, 2250]);
    expect(tickValues(1500).map((mark) => mark.ml)).to.eql([400, 800, 1200]);
    expect(tickValues(100).map((mark) => mark.ml)).to.eql([25, 50, 75]);
    expect(tickValues(120).map((mark) => mark.ml)).to.eql([30, 60, 90]);
  });

  it('never prints a mark past the goal it stands for', () => {
    for (const goal of [200, 500, 1000, 1750, 2000, 2500, 3000, 4000, 5000]) {
      const marks = tickValues(goal);
      expect(marks.length).to.be.greaterThanOrEqual(1);
      for (const mark of marks) {
        expect(mark.ml).to.be.lessThanOrEqual(goal);
        expect(mark.fraction).to.be.greaterThan(0);
        expect(mark.fraction).to.be.lessThan(1);
        expect(mark.fraction).to.be.closeTo(mark.ml / goal, 1e-9);
      }
    }
  });

  it('rounds a raw quarter step to a printable number', () => {
    expect(niceStep(625)).toBe(600);
    expect(niceStep(375)).toBe(400);
    expect(niceStep(250)).toBe(250);
    expect(niceStep(500)).toBe(500);
    expect(niceStep(0)).toBe(0);
  });

  it('places each tick where its own volume sits, not at fixed quarters', () => {
    const style = bottleById('slim');
    const svg = drawBottle(style, '20', [
      { fraction: 0.24, label: '600' },
      { fraction: 0.48, label: '1200' },
      { fraction: 0.72, label: '1800' },
    ]);
    const ys = [...svg.matchAll(/class="wt-tick wt-tick-[^"]*" d="M\d+ ([\d.]+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(ys.length).toBe(3);
    expect(ys[0]).toBe(Number(waterLevelY(style, 0.24).toFixed(1)));
    expect(ys[1]).toBe(Number(waterLevelY(style, 0.48).toFixed(1)));
    expect(ys[2]).toBe(Number(waterLevelY(style, 0.72).toFixed(1)));
    expect(svg).to.contain('>1800<');
    expect(svg).to.not.contain('250');
  });

  it('drops a tick that would sit at or above the rim', () => {
    const svg = drawBottle(bottleById('slim'), '21', [
      { fraction: 0, label: '0' },
      { fraction: 1, label: 'full' },
      { fraction: 0.5, label: 'half' },
    ]);
    expect(svg).to.not.contain('>full<');
    expect(svg).to.not.contain('>0<');
    expect(svg).to.contain('>half<');
  });

  it('only prints graduations for the shapes that have them', () => {
    expect(drawBottle(bottleById('slim'), '3', TICKS)).to.contain('wt-tick-label');
    expect(drawBottle(bottleById('sport'), '4', TICKS)).to.contain('wt-tick-bold');
    expect(drawBottle(bottleById('round'), '5', TICKS)).to.contain('wt-tick-label');
    expect(drawBottle(bottleById('tumbler'), '6', TICKS)).to.not.contain('wt-tick');
  });
});

describe('bottle artwork', () => {
  it('gives every drawing its own water clip', () => {
    const a = drawBottle(bottleById('slim'), '1', TICKS);
    const b = drawBottle(bottleById('sport'), '2', TICKS);
    expect(a).to.contain('wt-clip-1');
    expect(b).to.contain('wt-clip-2');
    expect(a).to.contain('clip-path="url(#wt-clip-1)"');
    expect(a).to.not.contain('wt-clip-2');
  });

  it('keeps the water group every style needs to animate', () => {
    for (const style of BOTTLE_STYLES) {
      const svg = drawBottle(style, '10', TICKS);
      expect(svg).to.contain('wt-wave-front');
      expect(svg).to.contain('class="wt-water"');
      expect(svg.startsWith('<svg')).toBe(true);
    }
  });

  it('never draws a straw that could read as a stray blue digit', () => {
    for (const style of BOTTLE_STYLES) {
      expect(drawBottle(style, '11', TICKS)).to.not.contain('wt-straw');
    }
  });

  it('lands every cap on its neck rather than floating above the bottle', () => {
    for (const style of BOTTLE_STYLES) {
      const svg = drawBottle(style, '12', TICKS);
      const bottoms = [...svg.matchAll(/class="wt-cap[^"]*"[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)].map(
        (match) => Number(match[1]) + Number(match[2]),
      );
      if (bottoms.length === 0) continue;
      const mouthTop = Number(/^M[\d.]+ ([\d.]+)/.exec(style.body)?.[1]);
      expect(Math.abs(Math.max(...bottoms) - mouthTop)).to.be.lessThanOrEqual(6);
    }
  });

  it('seats the stopper of the straight-mouthed bottle into its mouth', () => {
    const style = bottleById('round');
    const svg = drawBottle(style, '15', TICKS);
    const plug = /class="wt-stopper"[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg);
    expect(plug).to.not.equal(null);
    const top = Number(plug?.[1]);
    const bottom = top + Number(plug?.[2]);
    const mouthTop = Number(/^M[\d.]+ ([\d.]+)/.exec(style.body)?.[1]);
    expect(top).to.be.lessThan(mouthTop);
    expect(bottom).to.be.greaterThanOrEqual(mouthTop);
    expect(bottom - mouthTop).to.be.lessThanOrEqual(9);
    // the mouth stays plain apart from the clasp: no lip ring
    expect(svg).to.not.contain('wt-lip');
    expect([...svg.matchAll(/class="wt-wire"/g)].length).to.be.greaterThanOrEqual(2);
  });

  it('mirrors everything drawn at the neck across the centre line', () => {
    for (const style of BOTTLE_STYLES) {
      const svg = drawBottle(style, '16', TICKS);
      const xs: number[] = [];
      // The outline fields hold bare path data; the decorations are shapes, so each is read its own way.
      for (const data of [style.body, style.clip ?? '', ...pathData(style.rim, style.base, ...style.decor)]) {
        for (const [x, y] of pairs(data)) if (y <= 60) xs.push(x);
      }
      for (const box of rectsAt(style.decor)) {
        if (!Number.isFinite(box.y) || box.y > 60) continue;
        const x = box.x;
        const w = box.w;
        // a rect at the neck has to be centred, which is symmetry in one check
        expect(Math.abs(x + w / 2 - 60)).to.be.lessThanOrEqual(0.5);
        xs.push(x, x + w);
      }
      // a squat glass draws nothing at the neck, so the rule is vacuous there
      if (xs.length === 0) continue;
      expect(xs.length).to.be.greaterThanOrEqual(4);
      for (const x of xs) {
        const mirror = 120 - x;
        let mirrored = false;
        for (const other of xs) if (Math.abs(other - mirror) < 0.51) mirrored = true;
        expect(mirrored).toBe(true);
      }
    }
  });

  it('gives a lidless glass no cap, and draws no solid foot anywhere', () => {
    const glass = drawBottle(bottleById('tumbler'), '13', TICKS);
    expect(glass).to.not.contain('wt-cap');
    expect(glass).to.contain('wt-rim');
    for (const style of BOTTLE_STYLES) {
      expect(drawBottle(style, '14', TICKS)).to.not.contain('wt-base-solid');
    }
    expect(drawBottle(bottleById('slim'), '14', TICKS)).to.contain('wt-cap');
  });
});
