import { describe, expect, it } from 'vitest';
import { BOTTLE_STYLES } from '../src/bottles';
import { applySetting, readSetting, settingDefinitions } from '../src/settings-model';
import { DEFAULT_SETTINGS, type WaterSettings } from '../src/types';

const fresh = (): WaterSettings => ({ ...DEFAULT_SETTINGS, cupPresets: [...DEFAULT_SETTINGS.cupPresets] });

interface Row {
  name: string;
  desc: string;
  aliases: string[];
  control: { type: string; key: string; options?: Record<string, string> };
}

/** The rows, flattened out of the group the screen shows them inside. */
const rows = (): Row[] => {
  const collected: Row[] = [];
  for (const item of settingDefinitions()) {
    const group = item as { heading?: string; items?: Row[] };
    if (group.items !== undefined) collected.push(...group.items);
    else collected.push(item as unknown as Row);
  }
  return collected;
};

describe('the settings screen as data', () => {
  it('is a row per setting, six of them, in the order they appear', () => {
    expect(rows().map((row) => row.control.key)).toEqual(['folder', 'goalMl', 'cupMl', 'cupPresets', 'bottle', 'unit']);
  });

  // This is what the review was on about: a tab that draws itself is invisible to the settings
  // search, because there is nothing to search. name, desc and aliases are the indexed text, so a
  // row without them is a setting nobody can find by typing what it is for.
  it('gives every row the words someone would actually type to find it', () => {
    for (const row of rows()) {
      expect(row.name.trim().length).toBeGreaterThan(2);
      expect(row.desc.trim().length).toBeGreaterThan(10);
      expect(row.aliases.length).toBeGreaterThanOrEqual(3);
      for (const alias of row.aliases) expect(alias.trim().length).toBeGreaterThan(1);
    }
  });

  it('lists every bottle to choose from, by its name rather than its id', () => {
    const bottle = rows().find((row) => row.control.key === 'bottle')!;
    expect(bottle.control.type).toBe('dropdown');
    expect(Object.keys(bottle.control.options!).sort()).toEqual(BOTTLE_STYLES.map((style) => style.id).sort());
    for (const style of BOTTLE_STYLES) expect(bottle.control.options![style.id]).toBe(style.name);
  });

  it('offers only the two units there are', () => {
    const unit = rows().find((row) => row.control.key === 'unit')!;
    expect(unit.control.options).toEqual({ ml: 'ml', oz: 'oz' });
  });

  it('has a group heading, so the screen is not a bare list under the plugin name', () => {
    expect((settingDefinitions()[0] as { heading?: string }).heading).toBe('Water tracker');
  });
});

describe('what a row writes back', () => {
  it('reads a number field as the text a person would have typed', () => {
    expect(readSetting(fresh(), 'goalMl')).toBe('2000');
    expect(readSetting(fresh(), 'cupPresets')).toBe('150, 250, 500');
  });

  it('round-trips what it accepts', () => {
    for (const [key, value] of [
      ['folder', 'Drinks/Water'],
      ['goalMl', '2500'],
      ['cupMl', '300'],
      ['cupPresets', '100, 200, 300'],
      ['bottle', 'round'],
      ['unit', 'oz'],
    ] as [string, unknown][]) {
      const settings = fresh();
      expect(applySetting(settings, key, value), key).toBe(true);
      expect(readSetting(settings, key), key).toBe(String(value));
    }
  });

  it('trims a folder of slashes and never lets it go empty', () => {
    const settings = fresh();
    applySetting(settings, 'folder', '  /Water/  ');
    expect(settings.folder).toBe('Water');
    applySetting(settings, 'folder', '   ');
    expect(settings.folder).toBe('Water Tracker');
  });

  it('will not store an amount that is not a positive whole number', () => {
    for (const value of ['', '0', '-4', 'abc', 'Infinity', 'NaN']) {
      const settings = fresh();
      applySetting(settings, 'goalMl', value);
      expect(settings.goalMl, JSON.stringify(value)).toBe(2000);
    }
    const rounded = fresh();
    applySetting(rounded, 'cupMl', '3.7');
    expect(rounded.cupMl).toBe(4);
  });

  it('keeps quick buttons usable: in range, at most four, defaults when none survive', () => {
    const mixed = fresh();
    applySetting(mixed, 'cupPresets', '150, 9999, abc, 200, 100, 50');
    expect(mixed.cupPresets).toEqual([150, 200, 100, 50]);

    const none = fresh();
    applySetting(none, 'cupPresets', 'nonsense, and, zeroes');
    expect(none.cupPresets).toEqual([150, 250, 500]);
  });

  it('falls back rather than storing a bottle that does not exist', () => {
    const settings = fresh();
    applySetting(settings, 'bottle', 'mug');
    expect(settings.bottle).toBe(BOTTLE_STYLES[0].id);
  });

  it('accepts only the two units', () => {
    const settings = fresh();
    applySetting(settings, 'unit', 'oz');
    expect(settings.unit).toBe('oz');
    applySetting(settings, 'unit', 'pints');
    expect(settings.unit).toBe('ml');
  });

  it('says whether anything moved, so a redraw does not rewrite the file', () => {
    const settings = fresh();
    expect(applySetting(settings, 'goalMl', '2000')).toBe(false);
    expect(applySetting(settings, 'goalMl', '2100')).toBe(true);
    expect(applySetting(settings, 'goalMl', '2100')).toBe(false);

    // An array is equal to its own contents here, not to a fresh reference holding them.
    expect(applySetting(settings, 'cupPresets', '150, 250, 500')).toBe(false);
    expect(applySetting(settings, 'cupPresets', '150, 250, 501')).toBe(true);
  });

  it('ignores a key it does not own rather than inventing a setting', () => {
    const settings = fresh();
    expect(applySetting(settings, 'dailyGoal', '9000')).toBe(false);
    expect(applySetting(settings, '__proto__', 'x')).toBe(false);
    expect(readSetting(settings, 'dailyGoal')).toBe(undefined);
    expect(settings.goalMl).toBe(2000);
  });
});
