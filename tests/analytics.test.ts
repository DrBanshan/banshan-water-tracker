import { describe, expect, it } from 'vitest';
import { cupDistribution, headline, heatLevel, monthGrid, WEEKDAY_LABELS, weekdayPattern } from '../src/analytics';
import { dateKey } from '../src/model';

const GOAL = 1000;
const rows = (entries: [string, number][]) => entries.map(([key, total]) => ({ key, total }));

describe('headline numbers', () => {
  it('counts the goal average over every day, dry ones included', () => {
    const stats = headline(rows([
      ['2026-09-27', 0],
      ['2026-09-28', 500],
      ['2026-09-29', 1500],
    ]), GOAL, new Date(2026, 8, 29, 20, 0));

    expect(stats.average).toBe(667);
    expect(stats.daysLogged).toBe(2);
    expect(stats.days).toBe(3);
  });

  it('reports the share of days that reached the goal', () => {
    const stats = headline(rows([
      ['2026-09-26', 1000],
      ['2026-09-27', 1200],
      ['2026-09-28', 300],
      ['2026-09-29', 0],
    ]), GOAL, new Date(2026, 8, 29, 20, 0));

    expect(stats.hitRate).toBe(50);
  });

  it('names the best day and ignores days with nothing logged', () => {
    const stats = headline(rows([
      ['2026-09-27', 0],
      ['2026-09-28', 1800],
      ['2026-09-29', 900],
    ]), GOAL, new Date(2026, 8, 29, 20, 0));

    expect(stats.best?.key).toBe('2026-09-28');
    expect(stats.best?.total).toBe(1800);
    expect(headline(rows([]), GOAL, new Date(2026, 8, 29)).best).toBe(null);
  });

  it('walks the streak further back than the chart window when told to', () => {
    const narrow = rows([['2026-09-29', 1200], ['2026-09-28', 1000]]);
    const wide = rows([
      ['2026-09-25', 1000],
      ['2026-09-26', 1000],
      ['2026-09-27', 1000],
      ['2026-09-28', 1000],
      ['2026-09-29', 1200],
    ]);

    expect(headline(narrow, GOAL, new Date(2026, 8, 29, 20, 0)).streak).toBe(2);
    expect(headline(narrow, GOAL, new Date(2026, 8, 29, 20, 0), wide).streak).toBe(5);
  });
});

describe('weekday rhythm', () => {
  it('spreads one week across seven buckets, one per weekday', () => {
    const week: [string, number][] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      week.push([dateKey(new Date(2026, 8, 21 + offset)), 100 * (offset + 1)]);
    }

    const pattern = weekdayPattern(rows(week));
    expect(pattern.map((bar) => bar.label)).to.eql(WEEKDAY_LABELS);
    expect(pattern.reduce((sum, bar) => sum + bar.days, 0)).toBe(7);
    expect(pattern.filter((bar) => bar.average === 0)).to.have.length(0);
  });

  it('keeps the same weekday in the same bucket a week apart', () => {
    const one = weekdayPattern(rows([['2026-09-22', 400]]));
    const two = weekdayPattern(rows([['2026-09-29', 400]]));
    const index = one.findIndex((bar) => bar.average === 400);

    expect(index).to.be.greaterThan(-1);
    expect(two[index].average).toBe(400);
    expect(two[(index + 1) % 7].average).toBe(0);
  });
});

describe('month calendar grid', () => {
  it('pads the front so the first of the month sits under its weekday', () => {
    const totals = new Map([['2026-09-01', 500], ['2026-09-30', 1200]]);
    const grid = monthGrid(totals, 2026, 9);
    const days = grid.filter((cell) => !cell.blank);

    const firstWeekday = (new Date(2026, 8, 1).getDay() + 6) % 7;
    expect(grid.length - days.length).toBe(firstWeekday);
    expect(days.length).toBe(30);
    expect(days[0]).to.have.property('key', '2026-09-01');
    expect(days[0].total).toBe(500);
    expect(days[days.length - 1].key).toBe('2026-09-30');
  });

  it('zero pads single digit days and handles a leap february', () => {
    const grid = monthGrid(new Map([['2028-02-05', 300]]), 2028, 2);
    const days = grid.filter((cell) => !cell.blank);

    expect(days).to.have.length(29);
    expect(days[0].key).toBe('2028-02-01');
    expect(days.some((cell) => cell.key === '2028-02-05' && cell.total === 300)).toBe(true);
    expect(days.every((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell.key))).toBe(true);
  });
});

describe('heat levels and cup habits', () => {
  it('buckets a day against the goal in five steps', () => {
    expect(heatLevel(0, GOAL)).toBe(0);
    expect(heatLevel(200, GOAL)).toBe(1);
    expect(heatLevel(500, GOAL)).toBe(2);
    expect(heatLevel(760, GOAL)).toBe(3);
    expect(heatLevel(1000, GOAL)).toBe(4);
  });

  it('orders cups by how often they get used', () => {
    const drinks = [
      { time: '08:00', ml: 250 },
      { time: '09:00', ml: 250 },
      { time: '10:00', ml: 250 },
      { time: '11:00', ml: 500 },
      { time: '12:00', ml: 150 },
    ];
    const usage = cupDistribution(drinks);

    expect(usage[0].ml).toBe(250);
    expect(usage[0].count).toBe(3);
    expect(usage[0].share).toBe(60);
    expect(usage.map((cup) => cup.ml)).to.eql([250, 150, 500]);
    expect(cupDistribution([])).to.eql([]);
  });
});
