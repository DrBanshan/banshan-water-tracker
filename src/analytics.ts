import { countStreak, dateKey } from './model';
import type { Drink } from './types';

export interface DayRow {
  key: string;
  total: number;
}

export interface Headline {
  streak: number;
  /** Percent of the days in the window that reached the goal. */
  hitRate: number;
  /** Mean over every day in the window, dry days included. */
  average: number;
  best: DayRow | null;
  daysLogged: number;
  days: number;
}

export interface WeekdayBar {
  /** 0 = Monday, so the week reads the way a planner does. */
  index: number;
  label: string;
  average: number;
  days: number;
}

export interface CupUsage {
  ml: number;
  count: number;
  share: number;
}

export interface HeatCell {
  key: string;
  day: number;
  total: number;
  blank: boolean;
}

export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** JS getDay() is 0=Sunday; the chart wants Monday first. */
function mondayIndex(dateKeyString: string): number {
  const day = new Date(
    Number(dateKeyString.slice(0, 4)),
    Number(dateKeyString.slice(5, 7)) - 1,
    Number(dateKeyString.slice(8, 10)),
  ).getDay();
  return (day + 6) % 7;
}

export function headline(rows: DayRow[], goal: number, today: Date, streakRows: DayRow[] = rows): Headline {
  const safeGoal = Math.max(1, goal);
  const days = rows.length;
  const met = rows.filter((row) => row.total >= safeGoal);
  const logged = rows.filter((row) => row.total > 0);
  const best = rows.reduce<DayRow | null>((top, row) => (row.total > 0 && (!top || row.total > top.total) ? row : top), null);

  return {
    // The streak walks further back than the chart window, so it gets its own (wider) row set.
    streak: countStreak(today, (key) => streakRows.some((row) => row.key === key && row.total >= safeGoal)),
    hitRate: days > 0 ? Math.round((met.length / days) * 100) : 0,
    average: days > 0 ? Math.round(rows.reduce((sum, row) => sum + row.total, 0) / days) : 0,
    best,
    daysLogged: logged.length,
    days,
  };
}

export function weekdayPattern(rows: DayRow[]): WeekdayBar[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const row of rows) {
    const index = mondayIndex(row.key);
    totals[index] += row.total;
    counts[index] += 1;
  }

  return WEEKDAY_LABELS.map((label, index) => ({
    index,
    label,
    average: counts[index] > 0 ? Math.round(totals[index] / counts[index]) : 0,
    days: counts[index],
  }));
}

export function cupDistribution(drinks: Drink[]): CupUsage[] {
  const counts = new Map<number, number>();
  for (const drink of drinks) counts.set(drink.ml, (counts.get(drink.ml) ?? 0) + 1);

  const total = drinks.length;
  return [...counts.entries()]
    .map(([ml, count]) => ({ ml, count, share: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.ml - b.ml);
}

/** Calendar month as Monday-first cells, with leading blanks so columns line up. */
export function monthGrid(totalByDay: Map<string, number>, year: number, month: number): HeatCell[] {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const cells: HeatCell[] = [];

  for (let pad = 0; pad < mondayIndex(dateKey(first)); pad += 1) {
    cells.push({ key: `blank-${pad}`, day: 0, total: 0, blank: true });
  }
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const key = dateKey(date);
    cells.push({ key, day, total: totalByDay.get(key) ?? 0, blank: false });
  }
  return cells;
}

/** Buckets a day against the goal so the view can shade five tones and nothing more. */
export function heatLevel(total: number, goal: number): number {
  if (total <= 0) return 0;
  const ratio = total / Math.max(1, goal);
  if (ratio >= 1) return 4;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}
