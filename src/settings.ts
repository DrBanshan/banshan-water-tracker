import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { applySetting, readSetting, settingDefinitions } from './settings-model';
import type WaterTrackerPlugin from './main';

export class WaterTrackerSettingTab extends PluginSettingTab {
  plugin: WaterTrackerPlugin;

  constructor(app: App, plugin: WaterTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * The screen is drawn from these rows, and since 1.13.0 searched through them: a tab that
   * renders itself imperatively is invisible to the settings search, so handing the words over is
   * what makes "goal" or "bottle" findable by someone who does not already know where to look.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return settingDefinitions();
  }

  // PluginSettingTab already reads and writes this.plugin.settings, which is where this plugin
  // keeps them, so these two only add the shaping: the read gives a text control something to
  // show, and the write refuses to store anything the reader could not make sense of later.
  getControlValue(key: string): unknown {
    return readSetting(this.plugin.settings, key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // saveSettings persists and redraws the bottle, so a goal changed here moves the water line
    // without anybody having to close the screen and come back.
    if (applySetting(this.plugin.settings, key, value)) await this.plugin.saveSettings();
  }
}
