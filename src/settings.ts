import { App, PluginSettingTab, Setting } from 'obsidian';
import { BOTTLE_STYLES, bottleById } from './bottles';
import type WaterTrackerPlugin from './main';

const int = (value: string, fallback: number): number => {
  const parsed = Number(value.trim().replace(/[, ]+$/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

export class WaterTrackerSettingTab extends PluginSettingTab {
  plugin: WaterTrackerPlugin;

  constructor(app: App, plugin: WaterTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Water tracker').setHeading();

    new Setting(containerEl)
      .setName('Data folder')
      .setDesc('One markdown file per month, named YYYY-MM.md, holds every entry. Everything is plain text you can read and edit.')
      .addText((text) => text
        .setPlaceholder('Water Tracker')
        .setValue(this.plugin.settings.folder)
        .onChange(async (value) => {
          this.plugin.settings.folder = value.trim().replace(/^\/+|\/+$/g, '') || 'Water Tracker';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Daily goal')
      .setDesc('Target for the day, in millilitres.')
      .addText((text) => text
        .setPlaceholder('2000')
        .setValue(String(this.plugin.settings.goalMl))
        .onChange(async (value) => {
          this.plugin.settings.goalMl = int(value, 2000);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('One tap of the bottle')
      .setDesc('How much water a single tap adds, in millilitres.')
      .addText((text) => text
        .setPlaceholder('250')
        .setValue(String(this.plugin.settings.cupMl))
        .onChange(async (value) => {
          this.plugin.settings.cupMl = int(value, 250);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Quick buttons')
      .setDesc('Amounts shown as buttons, comma separated, in millilitres. Up to four.')
      .addText((text) => text
        .setPlaceholder('150, 250, 500')
        .setValue(this.plugin.settings.cupPresets.join(', '))
        .onChange(async (value) => {
          const presets = value
            .split(',')
            .map((part) => Number(part.trim()))
            .filter((ml) => Number.isFinite(ml) && ml > 0 && ml <= 5000)
            .slice(0, 4);
          this.plugin.settings.cupPresets = presets.length > 0 ? presets : [150, 250, 500];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Bottle')
      .setDesc('Which drawing to show. Only the artwork changes, the water level is still today over goal.')
      .addDropdown((dropdown) => {
        for (const style of BOTTLE_STYLES) dropdown.addOption(style.id, style.name);
        dropdown.setValue(this.plugin.settings.bottle).onChange(async (value) => {
          this.plugin.settings.bottle = bottleById(value).id;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Unit shown')
      .setDesc('Only how amounts are displayed. The file always stores millilitres.')
      .addDropdown((dropdown) => dropdown
        .addOption('ml', 'ml')
        .addOption('oz', 'oz')
        .setValue(this.plugin.settings.unit)
        .onChange(async (value) => {
          this.plugin.settings.unit = value === 'oz' ? 'oz' : 'ml';
          await this.plugin.saveSettings();
        }));
  }
}
