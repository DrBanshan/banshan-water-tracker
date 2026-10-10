import { Notice, Plugin } from 'obsidian';
import { bottleById } from './bottles';
import { dateKey, logTime } from './model';
import { WaterStore } from './store';
import { WaterTrackerSettingTab } from './settings';
import { DEFAULT_SETTINGS } from './types';
import type { WaterSettings } from './types';
import { VIEW_TYPE_WATER_TRACKER, WaterTrackerView } from './view';

export default class WaterTrackerPlugin extends Plugin {
  settings: WaterSettings = { ...DEFAULT_SETTINGS, cupPresets: [...DEFAULT_SETTINGS.cupPresets] };
  store!: WaterStore;

  async onload(): Promise<void> {
    await this.loadSettings();
    // The store holds the settings object by reference, so edits in the settings tab apply at once.
    this.store = new WaterStore(this.app, this.settings);

    this.registerView(VIEW_TYPE_WATER_TRACKER, (leaf) => new WaterTrackerView(leaf, this));

    this.addRibbonIcon('droplet', 'Water tracker', () => void this.activateView());

    this.addCommand({
      id: 'open-water-tracker',
      name: 'Water tracker: Open view',
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: 'add-cup',
      name: 'Water tracker: Add a cup',
      callback: () => void this.addCup(this.settings.cupMl),
    });
    this.addCommand({
      id: 'undo-cup',
      name: 'Water tracker: Undo the last cup of today',
      callback: () => void this.undoLast(),
    });

    this.addSettingTab(new WaterTrackerSettingTab(this.app, this));

    // A sync can drop a changed day file on us from the phone, so watch what we own.
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file.path.startsWith(`${this.settings.folder}/`)) void this.refresh();
      }),
    );
  }

  /** Logging into the day you are editing keeps the real hour; a day already gone gets 23:59. */
  async addCup(ml: number, day?: Date): Promise<void> {
    const amount = Math.round(ml);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const now = new Date();
    const target = day ?? now;
    const key = dateKey(target);
    try {
      await this.store.addCup(amount, logTime(target, now), target);
    } catch (error) {
      new Notice(`Water tracker: could not write the entry for ${key} (${String(error)})`);
      return;
    }
    await this.refresh();
  }

  async undoLast(day?: Date): Promise<void> {
    const now = new Date();
    const target = day ?? now;
    const key = dateKey(target);
    let removed = false;
    try {
      removed = await this.store.undoLast(target);
    } catch (error) {
      new Notice(`Water tracker: could not undo (${String(error)})`);
      return;
    }
    const nothing = key === dateKey(now) ? 'Nothing logged today yet' : `Nothing logged on ${key} yet`;
    new Notice(removed ? 'Removed the last cup' : nothing);
    await this.refresh();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_WATER_TRACKER)[0];
    const leaf = existing ?? workspace.getLeaf(false);

    if (leaf && !existing) {
      await leaf.setViewState({ type: VIEW_TYPE_WATER_TRACKER, state: {} });
    }
    if (leaf) void workspace.revealLeaf(leaf);
  }

  async refresh(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WATER_TRACKER)) {
      const view = leaf.view as WaterTrackerView | null;
      if (view && typeof view.render === 'function') await view.render();
    }
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<WaterSettings> | null;
    if (!saved) return;

    const presets = Array.isArray(saved.cupPresets)
      ? saved.cupPresets.map(Number).filter((ml) => Number.isFinite(ml) && ml > 0 && ml <= 5000).slice(0, 4)
      : [];

    Object.assign(this.settings, {
      folder: typeof saved.folder === 'string' && saved.folder.trim().length > 0 ? saved.folder.trim() : DEFAULT_SETTINGS.folder,
      goalMl: positive(saved.goalMl, DEFAULT_SETTINGS.goalMl),
      cupMl: positive(saved.cupMl, DEFAULT_SETTINGS.cupMl),
      cupPresets: presets.length > 0 ? presets : [...DEFAULT_SETTINGS.cupPresets],
      unit: saved.unit === 'oz' ? 'oz' : 'ml',
      bottle: bottleById(typeof saved.bottle === 'string' ? saved.bottle : '').id,
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.refresh();
  }
}

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}
