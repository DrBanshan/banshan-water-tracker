import { describe, expect, it } from 'vitest';
import {
  BOTTLE_STYLES,
  bottleById,
  bottleTree,
  mountShape,
  type TickMark,
  drawBottle,
  waterLevelY,
} from '../src/bottles';

/**
 * The screen mounts the artwork element by element; the tests have always read its text form. Two
 * consumers of one tree is exactly the arrangement that quietly disagrees with itself, so this file
 * holds them to each other. Vitest has no browser, so the single global mountShape touches is
 * stood up here as a recorder rather than pulled in as a dependency: the plugin still ships none.
 */

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attrs: Record<string, string> = {};
  /** Named as the dom names it, because this fake is only worth having if it implements the
   * surface mountShape actually touches: setAttribute, textContent, append. */
  textContent: string | null = null;

  constructor(readonly namespace: string, readonly tag: string) {}

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  append(child: FakeElement): void {
    this.children.push(child);
  }

  /** This element and everything below it, as `tag|class|detail` in document order. */
  collect(into: string[] = []): string[] {
    into.push(`${this.tag}|${this.attrs['class'] ?? ''}|${this.detail()}`);
    for (const child of this.children) {
      child.collect(into);
    }
    return into;
  }

  /**
   * What identifies this element at a glance: the line a path draws, the place a rect sits, the
   * words a label holds. Chosen by tag so that a text element reports its words rather than the
   * column it was put in, which is what the same rule on the markup side does.
   */
  private detail(): string {
    if (this.tag === 'text') {
      return this.textContent ?? '';
    }
    return this.attrs['d'] ?? this.attrs['x'] ?? '';
  }
}

const mount = (style: (typeof BOTTLE_STYLES)[number], ticks: TickMark[]): FakeElement => {
  const root = new FakeElement('html', 'div');
  const document = {
    createElementNS: (namespace: string, tag: string): FakeElement => new FakeElement(namespace, tag),
  };

  // A platform global, stood up for one call and taken away again, not a channel between steps.
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true, writable: true });
  try {
    mountShape(root as unknown as Element, bottleTree(style, '7', ticks));
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
  return root;
};

const find = (element: FakeElement, tag: string, className: string): FakeElement | undefined => {
  if (element.tag === tag && (element.attrs['class'] ?? '') === className) {
    return element;
  }
  for (const child of element.children) {
    const found = find(child, tag, className);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};

/** The same `tag|class|detail` tuples, read back out of the markup form of the very same tree. */
function tuplesFromMarkup(markup: string): string[] {
  const out: string[] = [];
  const tagPattern = /<(svg|defs|clipPath|g|path|rect|text)\b([^>]*)>/g;
  for (;;) {
    const match = tagPattern.exec(markup);
    if (match === null) {
      break;
    }
    const [, tag, attributes] = match;
    const className = /class="([^"]*)"/.exec(attributes)?.[1] ?? '';
    const d = /\sd="([^"]*)"/.exec(attributes)?.[1] ?? '';
    const x = /\sx="([^"]*)"/.exec(attributes)?.[1] ?? '';
    let detail = d !== '' ? d : x;
    if (tag === 'text') {
      // A label lives after the opening tag and before the next one, so it is read from there.
      const start = match.index + match[0].length;
      detail = markup.slice(start, markup.indexOf('<', start));
    }
    out.push(`${tag}|${className}|${detail}`);
  }
  return out;
}

const TICKS: TickMark[] = [
  { fraction: 0.24, label: '600' },
  { fraction: 0.48, label: '1200' },
  { fraction: 0.72, label: '1800' },
];

describe('mounting the artwork', () => {
  it('builds the picture the string form describes, element for element, on every style', () => {
    for (const style of BOTTLE_STYLES) {
      const mounted = mount(style, TICKS).children[0]!.collect();
      const fromMarkup = tuplesFromMarkup(drawBottle(style, '7', TICKS));
      expect(mounted, style.id).toEqual(fromMarkup);
      // A guard against both sides going quiet at once: an empty list would agree with anything.
      expect(mounted.length, `${style.id}: element count`).toBeGreaterThanOrEqual(12);
    }
  });

  it('asks for every element in the svg namespace, because html ones simply do not render', () => {
    for (const style of BOTTLE_STYLES) {
      const svg = mount(style, TICKS).children[0]!;
      const seen: FakeElement[] = [];
      const walk = (element: FakeElement): void => {
        seen.push(element);
        for (const child of element.children) {
          walk(child);
        }
      };
      walk(svg);
      expect(seen.length).toBeGreaterThanOrEqual(12);
      for (const element of seen) {
        // Pinned to the uri the svg spec fixes, deliberately not to the module's own SVG_NS: an
        // assertion written against the constant it is meant to check would pass whatever that
        // constant were changed to, which is the same as asserting nothing.
        expect(element.namespace, `${style.id} <${element.tag}>`).toBe('http://www.w3.org/2000/svg');
      }
      // The clip path is referred to by id, so its name has to survive the trip in one piece.
      expect(seen.some((element) => element.tag === 'clipPath' && /^wt-clip-/.test(element.attrs['id'] ?? ''))).toBe(true);
    }
  });

  it('starts the water at the empty line and leaves the level to the stylesheet transform', () => {
    const style = bottleById('slim');
    const svg = mount(style, TICKS).children[0]!;
    const water = find(svg, 'g', 'wt-water');
    expect(water).to.be.an('object');
    expect(water!.attrs['transform']).toBe(`translate(0 ${waterLevelY(style, 0)})`);
    expect(water!.children.map((child) => child.attrs['class'])).toEqual(['wt-wave wt-wave-back', 'wt-wave wt-wave-front']);
    // The clip that keeps the water inside the glass is the one this element is pointed at.
    const clipped = find(svg, 'g', '');
    expect(clipped!.attrs['clip-path']).toBe(`url(#${find(svg, 'clipPath', '')!.attrs['id']})`);
  });

  it('carries a graduation label as text, never as markup to be parsed', () => {
    const hostile = '<img src=x onerror="steal()">';
    const ticks: TickMark[] = [{ fraction: 0.5, label: hostile }];
    const svg = mount(bottleById('slim'), ticks).children[0]!;

    const labels = svg.collect().filter((line) => line.startsWith('text|'));
    expect(labels.length).toBe(1);
    // The label arrives verbatim as text content, which is the only thing a text node can hold.
    expect(labels[0]!.endsWith(`|${hostile}`)).toBe(true);

    // Nothing that merely looked like a tag inside the label became an element of its own.
    const tags = svg.collect().map((line) => line.split('|')[0]);
    expect(tags).not.toContain('img');

    // And in the text form the same label is inert, which is what the preview script reads.
    const markup = drawBottle(bottleById('slim'), '9', ticks);
    expect(markup).toContain('&lt;img');
    expect(markup).not.toContain('<img');
  });
});
