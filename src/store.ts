import type { App, TFile } from 'obsidian';
import { addDays, dateKey, dayTotal, monthKey, parseMonth } from './model';
import { addDrink, removeLastDrink } from './model';
import type { DayRow } from './analytics';

export type DaySummary = DayRow;

export interface WaterWindow {
  rows: DaySummary[];
  /** Month file contents keyed by `YYYY-MM`, exactly the files the window touches. */
  texts: Map<string, string>;
}

export class WaterStore {
  private app: App;
  private settings: { folder: string };

  constructor(app: App, settings: { folder: string }) {
    this.app = app;
    this.settings = settings;
  }

  private get vault() {
    return this.app.vault;
  }

  private folderPath(): string {
    return this.settings.folder.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  }

  /** `Water Tracker` + `2026-09` -> `Water Tracker/2026-09.md` */
  filePathForMonth(month: string): string {
    const folder = this.folderPath();
    return folder.length > 0 ? `${folder}/${month}.md` : `${month}.md`;
  }

  /** Read a month file, or '' when it does not exist yet, so callers never branch on null. */
  async readMonth(month: string): Promise<string> {
    const file = this.existingFile(this.filePathForMonth(month));
    if (!file) return '';
    return this.vault.cachedRead(file);
  }

  /** The whole read path: the day rows to chart plus the month texts they came from. */
  async readWindow(days: number, today: Date = new Date()): Promise<WaterWindow> {
    const rows: DaySummary[] = [];
    const texts = new Map<string, string>();

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset);
      const key = dateKey(day);
      const month = monthKey(day);
      if (!texts.has(month)) texts.set(month, await this.readMonth(month));
      rows.push({ key, total: dayTotal(texts.get(month) ?? '', key) });
    }
    return { rows, texts };
  }

  async totalFor(key: string, today: Date = new Date()): Promise<number> {
    return dayTotal(await this.readMonth(monthKey(today)), key);
  }

  /** Appending one row is the whole write path. vault.process keeps read-modify-save atomic across devices. */
  async addCup(ml: number, time: string, now: Date = new Date()): Promise<void> {
    const path = this.filePathForMonth(monthKey(now));
    const file = await this.ensureFile(path);
    await this.vault.process(file, (data) => addDrink(data, dateKey(now), { time, ml }));
  }

  async undoLast(now: Date = new Date()): Promise<boolean> {
    const path = this.filePathForMonth(monthKey(now));
    const file = this.existingFile(path);
    if (!file) return false;

    const key = dateKey(now);
    const before = parseMonth(await this.vault.read(file)).get(key)?.length ?? 0;
    await this.vault.process(file, (data) => removeLastDrink(data, key));
    const after = parseMonth(await this.vault.read(file)).get(key)?.length ?? 0;
    return after < before;
  }

  private existingFile(path: string): TFile | null {
    return this.vault.getFiles().find((file) => file.path === path) ?? null;
  }

  private async ensureFile(path: string): Promise<TFile> {
    const found = this.existingFile(path);
    if (found) return found;

    await this.ensureFolder(path.split('/').slice(0, -1).join('/'));
    return (await this.vault.create(path, '')) ?? this.existingFile(path)!;
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (folder.length === 0 || this.vault.getFolderByPath(folder)) return;
    // createFolder is one level deep, so walk down from the root.
    const parts = folder.split('/');
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const step = parts.slice(0, depth).join('/');
      if (!this.vault.getFolderByPath(step)) await this.vault.createFolder(step);
    }
  }
}
