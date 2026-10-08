import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { BOTTLE_STYLES, drawBottle, tickValues, type TickMark } from '../src/bottles';

/**
 * The contract between the drawing, the stylesheet, and the browser that has to combine them.
 *
 * Nothing here runs a browser. What it does check is the class of failure that a browser would
 * report as silence rather than as an error: a class emitted with no rule behind it paints nothing,
 * a clip path referring to an id that is not there clips everything away, a renamed keyframe stops
 * the water surging, and a custom property read without a fallback resolves to nothing at all. Every
 * one of those is invisible to a type checker and to a unit test of the geometry, and each of them
 * shows up on the screen as a bottle that simply is not there.
 */

const styles = fs.readFileSync('src/styles.css', 'utf8');

const sourceOf = (): string => {
  let all = '';
  for (const name of fs.readdirSync('src')) {
    if (name.endsWith('.ts')) {
      all += fs.readFileSync(`src/${name}`, 'utf8');
    }
  }
  return all;
};

const source = sourceOf();

/** Every drawing worth checking: each style, with the graduations on and off. */
function drawings(): { id: string; markup: string }[] {
  const out: { id: string; markup: string }[] = [];
  let uid = 0;
  for (const style of BOTTLE_STYLES) {
    const marks: TickMark[] = tickValues(2500).map((mark) => ({ fraction: mark.fraction, label: String(mark.ml) }));
    out.push({ id: style.id, markup: drawBottle(style, `r${(uid += 1)}`, marks) });
    out.push({ id: `${style.id} (no graduations)`, markup: drawBottle(style, `r${(uid += 1)}`, []) });
  }
  return out;
}

const DRAWINGS = drawings();

/** Walk the tags, tracking open elements. Returns the first complaint, or nothing when it balanced. */
function wellFormedness(markup: string): string | undefined {
  const open: string[] = [];
  const pattern = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  for (;;) {
    const match = pattern.exec(markup);
    if (match === null) {
      break;
    }
    const [, closing, tag, , selfClosing] = match;
    if (closing === '/') {
      const last = open.pop();
      if (last === undefined) {
        return `</${tag}> with nothing open`;
      }
      if (last !== tag) {
        return `</${tag}> closes <${last}>`;
      }
      continue;
    }
    if (selfClosing !== '/') {
      open.push(tag);
    }
  }
  return open.length === 0 ? undefined : `unclosed <${open.join('>, <')}>`;
}

describe('the drawing the browser is asked to render', () => {
  it('is well-formed markup, so the parser has a chance of rendering it', () => {
    expect(DRAWINGS.length).toBe(BOTTLE_STYLES.length * 2);
    for (const drawing of DRAWINGS) {
      expect(wellFormedness(drawing.markup), drawing.id).toBe(undefined);
      // Quotes come in pairs, or an attribute has run away past its own end quote.
      expect(drawing.markup.split('"').length % 2, `${drawing.id}: quote balance`).toBe(1);
      // A bare & is an entity that never closes, which is an error in xml rather than in html.
      expect(drawing.markup, drawing.id).not.toMatch(/&(?!(amp|lt|gt|quot|#)[a-zA-Z0-9]*;)/);
    }
  });

  it('leaks no undefined or NaN into an attribute, which is what a missing argument looks like', () => {
    for (const drawing of DRAWINGS) {
      expect(drawing.markup, `${drawing.id}: undefined`).not.toContain('undefined');
      expect(drawing.markup, `${drawing.id}: NaN`).not.toMatch(/NaN/);
      // Attribute values that came out of a template are the usual place this would appear.
      for (const value of drawing.markup.matchAll(/="([^"]*)"/g) ?? []) {
        expect(value[1], `${drawing.id}: attribute value`).not.toMatch(/^(null|Infinity|-?Infinity)$/);
      }
    }
  });

  it('refers every clip path to an id that is really in the same drawing', () => {
    for (const drawing of DRAWINGS) {
      const ids = [...(drawing.markup.matchAll(/\bid="([^"]+)"/g) ?? [])].map((match) => match[1]);
      const referenced = [...(drawing.markup.matchAll(/url\(#([^)]+)\)/g) ?? [])].map((match) => match[1]);
      expect(referenced.length, `${drawing.id}: has a clip reference`).toBeGreaterThanOrEqual(1);
      expect(new Set(ids).size, `${drawing.id}: ids are unique`).toBe(ids.length);
      for (const reference of referenced) {
        expect(ids, `${drawing.id}: url(#${reference}) resolves`).toContain(reference);
      }
      // An empty clip path clips everything away, which reads as a missing bottle rather than a
      // missing shape, so the one thing that must be inside it has to be there.
      const clipBody = /<clipPath\b[^>]*>([\s\S]*?)<\/clipPath>/.exec(drawing.markup)?.[1] ?? '';
      expect((clipBody.match(/<path\b/g) ?? []).length, `${drawing.id}: clip path has one path`).toBe(1);
    }
  });
});

describe('the stylesheet behind the drawing', () => {
  const styledClasses = (): Set<string> =>
    new Set([...(styles.matchAll(/\.((?:wt|is)-[a-zA-Z0-9-]+)/g) ?? [])].map((match) => match[1]));

  it('has a rule behind every class the artwork emits, because no rule means no paint', () => {
    const styled = styledClasses();
    expect(styled.size).toBeGreaterThanOrEqual(60);
    for (const drawing of DRAWINGS) {
      for (const match of drawing.markup.matchAll(/\bclass="([^"]+)"/g) ?? []) {
        for (const className of match[1].split(' ')) {
          expect(styled.has(className), `${drawing.id}: .${className} is styled`).toBe(true);
        }
      }
    }
  });

  // The other direction is housekeeping rather than correctness, so it is a ratchet: cruft that is
  // already there is allowed to stay until somebody chooses to clear it, but new cruft is refused.
  // Both of these predate the artwork being data, and neither is mine to delete quietly.
  const knownDead = ['wt-analysis', 'wt-stats'];

  it('styles no class that the source has stopped producing, beyond the cruft already noted', () => {
    const reachable = (className: string): boolean => {
      if (source.includes(className)) {
        return true;
      }
      // A class put together from a template, such as wt-h${level}, never appears whole in source.
      for (let length = className.length - 1; length >= 4; length -= 1) {
        if (source.includes(`${className.slice(0, length)}\${`)) {
          return true;
        }
      }
      return false;
    };
    const unreachable = [...styledClasses()].filter((className) => !reachable(className));
    expect(unreachable.filter((className) => !knownDead.includes(className))).toEqual([]);
  });

  it('still has the rules the rising water animates from', () => {
    // The level is moved by setting a transform on the water group, so the transition that makes
    // it a rise rather than a jump has to name that same property.
    expect(styles).toMatch(/\.wt-water\s*\{[^}]*transition:[^}]*transform/);
    expect(styles).toMatch(/\.wt-water\s*\{[^}]*will-change:[^}]*transform/);
    // A keyframe that is renamed rather than deleted leaves the wave standing still with no error.
    // Membership of an exact set is the only check that means anything here: testing that the text
    // contains "@keyframes wt-surge-front" also passes when it has been renamed to
    // wt-surge-front-v2, which is the very breakage the check exists to catch.
    // 'none' is the css keyword that switches animation off, not the name of one.
    const defined = new Set([...(styles.matchAll(/@keyframes\s+([a-zA-Z][\w-]*)/g) ?? [])].map((match) => match[1]));
    const used = [...(styles.matchAll(/animation:\s*([a-zA-Z][\w-]*)/g) ?? [])]
      .map((match) => match[1])
      .filter((name) => name !== 'none');
    expect(defined.size).toBeGreaterThanOrEqual(2);
    expect(used.length).toBeGreaterThanOrEqual(2);
    for (const name of used) {
      expect(defined.has(name), `animation refers to ${name}, which is not defined`).toBe(true);
    }
    // And a person who asked for reduced motion still gets a bottle, just a still one.
    expect(styles).toMatch(/prefers-reduced-motion[\s\S]*?animation:\s*none/);
  });

  it('gives every one of our own theme variables a fallback, since one resolving to nothing hides a stroke', () => {
    // Only the --wt- ones. The rest are Obsidian's theme variables and are guaranteed to be there,
    // and a nested var(--x, var(--y)) reads its inner one bare by the way it is written.
    const reads = [...(styles.matchAll(/var\(\s*(--wt-[a-zA-Z0-9-]+)\s*([,)])/g) ?? [])];
    expect(reads.length).toBeGreaterThanOrEqual(15);
    for (const match of reads) {
      expect(match[2], `${match[1]} carries a fallback`).toBe(',');
    }
  });
});
