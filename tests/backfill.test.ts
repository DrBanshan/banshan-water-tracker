import { describe, expect, it } from 'vitest';
import {
  addDrink,
  addDays,
  dateKey,
  dayTotal,
  daysApart,
  keyToDate,
  logTime,
  marksEditedDay,
  parseMonth,
  removeLastDrink,
  stripHasToSlide,
  TABLE_DIVIDER,
  TABLE_HEADER,
  windowDays,
} from '../src/model';

// The rules about counting across the night the clocks spring forward can only bite in a timezone
// that has such a night. Naming one is the difference between those tests proving something and
// passing quietly on a machine that never shifts clocks.
process.env.TZ = 'America/New_York';

const TODAY = '2026-09-29';
const PAST = '2026-09-26';

/** A local date from a key, with an hour you choose, so no test depends on the machine timezone. */
const at = (key: string, hour = 9, minute = 0): Date => {
  const parts = key.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], hour, minute);
};

const block = (...times: string[]): string =>
  [`## ${PAST}`, '', TABLE_HEADER, TABLE_DIVIDER, ...times.map((time) => `| ${time} | 250 |`)].join('\n');

describe('the hour a logged cup is given', () => {
  it('keeps the real hour while you are logging into today', () => {
    const now = at(TODAY, 14, 20);
    expect(logTime(now, now)).toBe('14:20');
    expect(logTime(now, now)).not.toBe('23:59');
  });

  it('ignores what time the day being edited itself is set to', () => {
    // The chosen day arrives as a bare calendar date carrying an arbitrary hour. Reading the clock off
    // that object instead of off the real now would stamp entries at whatever hour it happened to hold.
    expect(logTime(at(TODAY, 0, 0), at(TODAY, 14, 20))).toBe('14:20');
  });

  it('puts a forgotten cup at the last minute of a day that has already gone', () => {
    expect(logTime(at(PAST, 8, 0), at(TODAY, 8, 0))).toBe('23:59');
  });

  it('still logs the honest hour late at night rather than stamping 23:59', () => {
    const now = at(TODAY, 23, 12);
    expect(logTime(now, now)).toBe('23:12');
  });

  it('is not fooled by a day ahead of today', () => {
    expect(logTime(at('2026-09-30', 9, 0), at(TODAY, 9, 0))).toBe('23:59');
  });

  it('holds at 23:59 across the night the clocks spring forward', () => {
    // The hour that is skipped on a daylight saving night is exactly where counting on raw
    // milliseconds starts handing back the wrong answer, so this is the case worth nailing down.
    expect(logTime(at('2026-03-07', 0, 0), at('2026-03-08', 0, 30))).toBe('23:59');
  });
});

describe('counting days apart', () => {
  it('is zero for one calendar day however late in it both instants are', () => {
    expect(daysApart(at(TODAY, 0, 1), at(TODAY, 23, 59))).toBe(0);
  });

  it('is one across midnight even when both instants sit minutes apart', () => {
    expect(daysApart(at(TODAY, 23, 59), at('2026-09-30', 0, 1))).toBe(1);
  });

  it('is one across the spring forward night', () => {
    expect(daysApart(at('2026-03-07', 23, 0), at('2026-03-08', 0, 30))).toBe(1);
  });

  it('counts a new year as one day on', () => {
    expect(daysApart(at('2026-12-31', 22, 0), at('2027-01-01', 1, 0))).toBe(1);
  });

  it('goes negative when the earlier date is the second argument', () => {
    expect(daysApart(at(TODAY), at(PAST))).toBe(-3);
  });
});

describe('reading a day key back as a date', () => {
  it('lands on local midnight so the day cannot shift under a timezone', () => {
    // toISOString is the trap here: it reads back one day earlier west of UTC.
    expect(dateKey(keyToDate('2026-09-29'))).toBe('2026-09-29');
    expect(keyToDate('2026-09-29').getHours()).toBe(0);
    expect(keyToDate('2026-09-29').getDate()).toBe(29);
  });
});

describe('the strip of days a chart is drawn from', () => {
  it('holds every day in the span, logging or not', () => {
    const totals = new Map([['2026-09-29', 500]]);
    const days = windowDays(totals, at(TODAY), 4);
    expect(days.map((day) => day.key)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']);
    expect(days.map((day) => day.total)).toEqual([0, 0, 0, 500]);
  });

  it('ends at the day it is handed, which is how the strip slides to the day under edit', () => {
    const days = windowDays(new Map<string, number>(), at('2026-04-04'), 3);
    expect(days[days.length - 1].key).toBe('2026-04-04');
    expect(days[0].key).toBe('2026-04-02');
  });

  it('crosses a month edge without dropping a day', () => {
    const days = windowDays(new Map<string, number>(), at('2026-05-02'), 4);
    expect(days.map((day) => day.key)).toEqual(['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02']);
  });

  it('generates the count requested rather than trimming to what has data', () => {
    expect(windowDays(new Map(), at(TODAY), 30).length).toBe(30);
  });
});

describe('the machine this suite is running on', () => {
  it('has a real daylight saving night for the boundary tests to stand on', () => {
    // If the forcing above did not take, every spring forward assertion in this file would pass for
    // the wrong reason, so say out loud what the run is depending on.
    const gap = at('2026-03-09', 0, 0).getTime() - at('2026-03-08', 0, 0).getTime();
    expect(gap).not.toBe(24 * 60 * 60 * 1000);
  });
});

describe('which column carries the marker, and how far the strip has to reach', () => {
  const back = (days: number): string => dateKey(addDays(at(TODAY), -days));

  it('marks the day under edit when that day has already gone by', () => {
    expect(marksEditedDay(PAST, PAST, TODAY)).toBe(true);
  });

  it('marks nothing once you are back on today, which is when it is meant to vanish', () => {
    expect(marksEditedDay(TODAY, TODAY, TODAY)).toBe(false);
  });

  it('marks neither an untouched column nor a day that was selected some time ago', () => {
    expect(marksEditedDay('2026-09-25', PAST, TODAY)).toBe(false);
    expect(marksEditedDay(PAST, '2026-09-27', TODAY)).toBe(false);
  });

  it('leaves the strip where it is while the day under edit still falls inside it', () => {
    expect(stripHasToSlide(back(0), TODAY, 30)).toBe(false);
    expect(stripHasToSlide(back(29), TODAY, 30)).toBe(false);
  });

  it('slides the strip the moment the day under edit falls outside it', () => {
    expect(stripHasToSlide(back(30), TODAY, 30)).toBe(true);
    expect(stripHasToSlide(back(31), TODAY, 30)).toBe(true);
  });

  it('slides at the distance the strip asks for, not at a hardcoded thirty', () => {
    expect(stripHasToSlide(back(6), TODAY, 7)).toBe(false);
    expect(stripHasToSlide(back(7), TODAY, 7)).toBe(true);
  });
});

describe('a cup logged into a day that already went by', () => {
  it('opens that day block and touches no other total', () => {
    let text = addDrink('', TODAY, { time: '08:00', ml: 250 });
    text = addDrink(text, PAST, { time: logTime(at(PAST, 0, 0), at(TODAY, 18, 0)), ml: 250 });

    expect(text).toContain(`## ${PAST}`);
    expect(text).toContain('| 23:59 | 250 |');
    expect(dayTotal(text, PAST)).toBe(250);
    expect(dayTotal(text, TODAY)).toBe(250);
  });

  it('appends so the newest cup is the last row and undo takes that one', () => {
    let text = block('23:59');
    text = addDrink(text, PAST, { time: '23:59', ml: 500 });
    expect(dayTotal(text, PAST)).toBe(750);
    expect((parseMonth(text).get(PAST) ?? []).map((drink) => drink.ml)).toEqual([250, 500]);

    text = removeLastDrink(text, PAST);
    expect((parseMonth(text).get(PAST) ?? []).map((drink) => drink.ml)).toEqual([250]);
  });

  it('leaves today alone when undoing the day you were filling in', () => {
    let text = addDrink('', TODAY, { time: '09:00', ml: 250 });
    text = addDrink(text, PAST, { time: '23:59', ml: 300 });
    text = removeLastDrink(text, PAST);

    expect(dayTotal(text, PAST)).toBe(0);
    expect(dayTotal(text, TODAY)).toBe(250);
    // The emptied heading stays put: it is part of the user file, not bookkeeping to tidy away.
    expect(text).toContain(`## ${PAST}`);
  });

  it('cannot use midnight of the following day as the stamp, which is why it is 23:59', () => {
    // A row one minute too far is not clamped down, it is dropped, so 23:59 is the latest stamp that
    // survives the round trip rather than a convenience.
    const text = block('24:00', '23:59');
    expect((parseMonth(text).get(PAST) ?? []).map((drink) => drink.time)).toEqual(['23:59']);
  });
});
