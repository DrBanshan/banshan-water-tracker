import { describe, expect, it } from 'vitest';
import {
  addDrink,
  countStreak,
  dayDrinks,
  dayTotal,
  parseMonth,
  removeLastDrink,
  TABLE_DIVIDER,
  TABLE_HEADER,
} from '../src/model';

const DAY = '2026-09-29';
const OTHER = '2026-09-28';

const drink = (time: string, ml: number) => ({ time, ml });

describe('a brand new month file', () => {
  it('writes the heading, the table head and the first row', () => {
    const text = addDrink('', DAY, drink('09:05', 250));

    expect(text).toContain(`## ${DAY}`);
    expect(text).toContain(TABLE_HEADER);
    expect(text).toContain(TABLE_DIVIDER);
    expect(text).toContain('| 09:05 | 250 |');
    expect(dayTotal(text, DAY)).toBe(250);
  });

  it('keeps working when the file only holds the user own prose', () => {
    const text = addDrink('# My hydration notes\n\nSome thoughts.\n', DAY, drink('07:30', 150));

    expect(text).to.match(/^# My hydration notes/);
    expect(text).toContain('Some thoughts.');
    expect(dayTotal(text, DAY)).toBe(150);
  });
});

describe('logging several cups', () => {
  const base = addDrink(addDrink(addDrink('', DAY, drink('08:15', 250)), DAY, drink('13:40', 500)), DAY, drink('19:02', 150));

  it('appends in the order it happened and sums correctly', () => {
    expect(dayDrinks(base, DAY).map((d) => d.time)).toEqual(['08:15', '13:40', '19:02']);
    expect(dayTotal(base, DAY)).toBe(900);
  });

  it('never touches another day', () => {
    const two = addDrink(base, OTHER, drink('22:10', 200));

    expect(dayTotal(two, OTHER)).toBe(200);
    expect(dayTotal(two, DAY)).toBe(900);

    const undone = removeLastDrink(two, OTHER);
    expect(dayTotal(undone, OTHER)).toBe(0);
    expect(dayTotal(undone, DAY)).toBe(900);
  });

  it('undo drops exactly the newest row', () => {
    const undone = removeLastDrink(base, DAY);

    expect(dayDrinks(undone, DAY).map((d) => d.ml)).toEqual([250, 500]);
    expect(removeLastDrink(removeLastDrink(removeLastDrink(undone, DAY), DAY), DAY)).to.be.a('string');
    expect(dayTotal(removeLastDrink(removeLastDrink(removeLastDrink(undone, DAY), DAY), DAY), DAY)).toBe(0);
  });

  it('is unchanged when there is nothing to undo', () => {
    expect(removeLastDrink(base, '2026-01-01')).toBe(base);
  });
});

describe('two devices writing the same month', () => {
  it('keeps both rows when the same base text is edited twice', () => {
    const shared = addDrink('', DAY, drink('08:00', 250));
    const phone = addDrink(shared, DAY, drink('09:00', 150));
    const desktop = addDrink(shared, DAY, drink('09:07', 500));

    // Last write wins on the file, so the surviving text must still make sense on its own.
    expect(dayDrinks(phone, DAY).length).toBe(2);
    expect(dayDrinks(desktop, DAY).length).toBe(2);

    // And a real merge of the two writes loses nothing.
    const merged = addDrink(phone, DAY, drink('09:07', 500));
    expect(dayDrinks(merged, DAY).map((d) => d.ml)).toEqual([250, 150, 500]);
  });
});

describe('hand edited files', () => {
  const messy = [
    '# Notes',
    '',
    `## ${DAY}`,
    '',
    TABLE_HEADER,
    TABLE_DIVIDER,
    '| 08:00 | 250 |',
    'My own sentence about how I felt today.',
    '| not | a | row |',
    '| 99:99 | 300 |',
    '| 12:00 | oops |',
    '| 12:30 | 300 ml |',
    '',
    '## 2026-10-01',
    '',
    'Nothing counted here.',
  ].join('\n');

  it('counts only the rows it recognises and leaves the rest alone', () => {
    expect(dayDrinks(messy, DAY).map((d) => d.ml)).toEqual([250, 300]);
    expect(dayTotal(messy, DAY)).toBe(550);

    const after = addDrink(messy, DAY, drink('13:00', 100));
    expect(after).toContain('My own sentence about how I felt today.');
    expect(after).toContain('| not | a | row |');
    expect(after).toContain('| 99:99 | 300 |');
    expect(after).toContain('| 12:00 | oops |');
    expect(dayTotal(after, DAY)).toBe(650);
  });

  it('stops at the next heading of any level', () => {
    expect(dayTotal(messy, '2026-10-01')).toBe(0);
    expect(parseMonth(messy).has(DAY)).toBe(true);
  });

  it('builds a table when the day heading exists but the table does not', () => {
    const text = addDrink(`## ${DAY}\n\nProse only.\n`, DAY, drink('10:00', 250));

    expect(dayTotal(text, DAY)).toBe(250);
    expect(text).toContain(TABLE_HEADER);
    expect(text).toContain('Prose only.');
  });

  it('survives windows line endings', () => {
    const crlf = addDrink('', DAY, drink('08:00', 250)).split('\n').join('\r\n');

    expect(dayTotal(crlf, DAY)).toBe(250);
    const grown = addDrink(crlf, DAY, drink('09:00', 250));
    expect(grown).toContain('\r\n');
    expect(dayTotal(grown, DAY)).toBe(500);
  });
});

describe('streaks', () => {
  const met = (set: Set<string>) => (key: string) => set.has(key);
  const today = new Date(2026, 8, 29, 21, 0);

  it('counts back over consecutive days that hit the goal', () => {
    expect(countStreak(today, met(new Set(['2026-09-29', '2026-09-28', '2026-09-27'])))).toBe(3);
  });

  it('does not break the streak just because today is still dry', () => {
    expect(countStreak(today, met(new Set(['2026-09-28', '2026-09-27'])))).toBe(2);
  });

  it('stops at the first missed day', () => {
    expect(countStreak(today, met(new Set(['2026-09-29', '2026-09-27'])))).toBe(1);
  });

  it('is zero when nothing was ever enough', () => {
    expect(countStreak(today, met(new Set()))).toBe(0);
  });
});
