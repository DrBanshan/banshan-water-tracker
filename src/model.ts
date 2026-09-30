import type { Drink } from './types';

export const TABLE_HEADER = '| Time  | Amount |';
export const TABLE_DIVIDER = '| ----- | ------ |';

const DAY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/;
const ANY_HEADING = /^#{1,6}\s/;
/** First two cells must be a time and a number; a stray third column is tolerated. */
const ROW = /^\|\s*(\d{1,2}):(\d{2})\s*\|\s*(\d{1,5})\s*(?:ml)?\s*\|/i;

const ML_PER_OZ = 29.5735;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar key. Never toISOString here, that shifts the day across timezones. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(d: Date): string {
  return dateKey(d).slice(0, 7);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function nowTime(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatAmount(ml: number, unit: 'ml' | 'oz'): string {
  return unit === 'oz' ? `${(ml / ML_PER_OZ).toFixed(1)} oz` : `${ml} ml`;
}

/** Whole-number amount for a button label, in the user's unit. */
export function displayAmount(ml: number, unit: 'ml' | 'oz'): string {
  return unit === 'oz' ? String(Math.round(ml / ML_PER_OZ)) : String(ml);
}

export function formatRow(drink: Drink): string {
  return `| ${drink.time} | ${drink.ml} |`;
}

function split(text: string): { lines: string[]; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lf = text.split('\r\n').join('\n');
  return { lines: lf.length > 0 ? lf.split('\n') : [], eol };
}

function join(lines: string[], eol: string): string {
  return lines.join(eol);
}

function dayRange(lines: string[], key: string): { start: number; end: number } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const match = DAY_HEADING.exec(lines[i]);
    if (match && match[1] === key) {
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (ANY_HEADING.test(lines[j])) {
          end = j;
          break;
        }
      }
      return { start: i, end };
    }
  }
  return null;
}

function lastRowInRange(lines: string[], start: number, end: number): number {
  for (let i = end - 1; i > start; i -= 1) {
    if (ROW.test(lines[i])) return i;
  }
  return -1;
}

/** Everything in the file that is not a recognised row is the user's and is left alone. */
export function parseMonth(text: string): Map<string, Drink[]> {
  const { lines } = split(text);
  const days = new Map<string, Drink[]>();
  let current: Drink[] | null = null;

  for (const line of lines) {
    const heading = DAY_HEADING.exec(line);
    if (heading) {
      current = days.get(heading[1]) ?? null;
      if (!current) {
        current = [];
        days.set(heading[1], current);
      }
      continue;
    }
    if (ANY_HEADING.test(line)) {
      current = null;
      continue;
    }
    const row = current && ROW.exec(line);
    if (row) {
      const hour = Number(row[1]);
      const minute = Number(row[2]);
      if (hour < 24 && minute < 60) {
        current.push({ time: `${pad(hour)}:${pad(minute)}`, ml: Number(row[3]) });
      }
    }
  }
  return days;
}

export function dayDrinks(text: string, key: string): Drink[] {
  return parseMonth(text).get(key) ?? [];
}

export function dayTotal(text: string, key: string): number {
  return dayDrinks(text, key).reduce((sum, drink) => sum + drink.ml, 0);
}

/** Every day mentioned in one month file, totalled. */
export function dayTotals(text: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [key, drinks] of parseMonth(text)) {
    totals.set(key, totalOf(drinks));
  }
  return totals;
}

/** Entries across several month files, restricted to the days you ask for. */
export function drinksInRange(texts: Map<string, string>, keys: Set<string>): Drink[] {
  const drinks: Drink[] = [];
  for (const text of texts.values()) {
    for (const [key, entries] of parseMonth(text)) {
      if (keys.has(key)) drinks.push(...entries);
    }
  }
  return drinks;
}

export function totalOf(drinks: Drink[]): number {
  return drinks.reduce((sum, drink) => sum + drink.ml, 0);
}

/** Append one row to today's table, creating the day block when it is the first entry. */
export function addDrink(text: string, key: string, drink: Drink): string {
  const { lines, eol } = split(text);
  const range = dayRange(lines, key);
  const row = formatRow(drink);

  if (!range) {
    appendBlock(lines, [`## ${key}`, '', TABLE_HEADER, TABLE_DIVIDER, row]);
    return join(lines, eol);
  }

  const lastRow = lastRowInRange(lines, range.start, range.end);
  if (lastRow >= 0) {
    lines.splice(lastRow + 1, 0, row);
    return join(lines, eol);
  }

  const divider = lines.findIndex((line, i) => i > range.start && i < range.end && line.trim() === TABLE_DIVIDER);
  if (divider >= 0) {
    lines.splice(divider + 1, 0, row);
    return join(lines, eol);
  }

  lines.splice(range.start + 1, 0, '', TABLE_HEADER, TABLE_DIVIDER, row);
  return join(lines, eol);
}

/** Remove the newest row of one day. Used by undo. Returns the text untouched if there is nothing to undo. */
export function removeLastDrink(text: string, key: string): string {
  const { lines, eol } = split(text);
  const range = dayRange(lines, key);
  if (!range) return text;

  const lastRow = lastRowInRange(lines, range.start, range.end);
  if (lastRow < 0) return text;

  lines.splice(lastRow, 1);
  return join(lines, eol);
}

function appendBlock(lines: string[], block: string[]): void {
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length > 0) lines.push('');
  lines.push(...block, '');
}

/** Consecutive days that hit the goal, counting back from today (today only when already met). */
export function countStreak(today: Date, goalMet: (key: string) => boolean): number {
  let streak = 0;
  const cursor = new Date(today.getTime());
  if (!goalMet(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  // 4000 caps the walk so a hand-written "every day met" file cannot hang the view.
  while (streak < 4000 && goalMet(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
