import type { SettingControl, SettingDefinitionControl, SettingDefinitionItem } from 'obsidian';
import { BOTTLE_STYLES, bottleById } from './bottles';
import type { WaterSettings } from './types';

/**
 * The settings, kept apart from the screen that shows them.
 *
 * Two reasons for the split rather than one file with the tab class in it: these rules are what
 * actually protect the data, and they are testable only if reaching them does not mean loading an
 * Obsidian class. Nothing here imports Obsidian at runtime, only its types, which is what lets
 * vitest exercise a malformed settings form without a DOM.
 */

/** Every row the settings screen shows, named for what it writes into the settings object. */
export type SettingKey = 'folder' | 'goalMl' | 'cupMl' | 'cupPresets' | 'bottle' | 'unit';

const int = (value: string, fallback: number): number => {
  const parsed = Number(value.trim().replace(/[, ]+$/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

const presets = (value: string): number[] => {
  const parsed = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((ml) => Number.isFinite(ml) && ml > 0 && ml <= 5000)
    .slice(0, 4);
  return parsed.length > 0 ? parsed : [150, 250, 500];
};

const bottleOptions: Record<string, string> = {};
for (const style of BOTTLE_STYLES) bottleOptions[style.id] = style.name;

const row = (
  name: string,
  desc: string,
  aliases: string[],
  control: SettingControl<SettingKey>,
): SettingDefinitionControl<SettingKey> => ({ name, desc, aliases, control });

/**
 * The rows on the screen, in the order they appear.
 *
 * Since 1.13.0 Obsidian renders the tab out of this list and, more to the point, *searches*
 * through it: name, desc and aliases are what a person typing "goal" or "bottle" into the
 * settings search is matched against. Handing that text over is the whole reason to take the
 * declarative path, because an imperatively drawn tab is invisible to that search. The aliases
 * are therefore not decoration; they are how someone who does not know the word "cup" finds the
 * setting for the size of a tap on the bottle.
 */
export function settingDefinitions(): SettingDefinitionItem[] {
  return [
    {
      type: 'group',
      heading: 'Water tracker',
      items: [
        row(
          'Data folder',
          'One markdown file per month, named YYYY-MM.md, holds every entry. Everything is plain text you can read and edit.',
          ['folder', 'path', 'storage', 'location', 'markdown'],
          { type: 'text', key: 'folder', placeholder: 'Water Tracker' },
        ),
        row(
          'Daily goal',
          'Target for the day, in millilitres.',
          ['goal', 'target', 'daily', 'millilitres', 'litres'],
          { type: 'text', key: 'goalMl', placeholder: '2000' },
        ),
        row(
          'One tap of the bottle',
          'How much water a single tap adds, in millilitres.',
          ['cup', 'tap', 'glass', 'size', 'amount', 'millilitres'],
          { type: 'text', key: 'cupMl', placeholder: '250' },
        ),
        row(
          'Quick buttons',
          'Amounts shown as buttons, comma separated, in millilitres. Up to four.',
          ['quick', 'buttons', 'presets', 'shortcuts', 'cup', 'sizes'],
          { type: 'text', key: 'cupPresets', placeholder: '150, 250, 500' },
        ),
        row(
          'Bottle',
          'Which drawing to show. Only the artwork changes, the water level is still today over goal.',
          ['bottle', 'glass', 'style', 'artwork', 'flask', 'theme'],
          { type: 'dropdown', key: 'bottle', options: bottleOptions },
        ),
        row(
          'Unit shown',
          'Only how amounts are displayed. The file always stores millilitres.',
          ['unit', 'units', 'ml', 'oz', 'ounces', 'display'],
          { type: 'dropdown', key: 'unit', options: { ml: 'ml', oz: 'oz' } },
        ),
      ],
    },
  ];
}

/**
 * What a control should show. The two number fields are text inputs, so they come back as text:
 * the field has to hold what a person would type into it, not what the file stores.
 */
export function readSetting(settings: WaterSettings, key: string): unknown {
  switch (key) {
    case 'folder': return settings.folder;
    case 'goalMl': return String(settings.goalMl);
    case 'cupMl': return String(settings.cupMl);
    case 'cupPresets': return settings.cupPresets.join(', ');
    case 'bottle': return settings.bottle;
    case 'unit': return settings.unit;
    default: return undefined;
  }
}

// The one list-shaped setting needs comparing element by element, because two equal lists are
// still two different arrays to ===.
const changedNumbers = (before: number[], after: number[]): boolean =>
  before.length !== after.length || before.some((value, index) => value !== after[index]);

/**
 * What a control writes back, shaped the same way the rest of the plugin shapes it: a folder is
 * trimmed of slashes and never empty, amounts are positive whole numbers, at most four quick
 * buttons, a bottle id that is not one of ours falls back to the first, and the unit is one of
 * two strings. Both directions live here rather than in the widgets so that a value the screen
 * accepted is always a value the storage layer can read.
 *
 * Returns whether anything moved, so a control being redrawn with the value it already had does
 * not rewrite the settings file and repaint the bottle.
 */
export function applySetting(settings: WaterSettings, key: string, value: unknown): boolean {
  const text = typeof value === 'string' ? value : String(value ?? '');

  const write = <Key extends keyof WaterSettings>(name: Key, next: WaterSettings[Key]): boolean => {
    if (settings[name] === next) return false;
    settings[name] = next;
    return true;
  };

  // The quick buttons are an array, so === would call every save a change; comparing the numbers
  // themselves keeps a redrawing control from writing the file for nothing.
  if (key === 'cupPresets') {
    const next = presets(text);
    if (!changedNumbers(settings.cupPresets, next)) return false;
    settings.cupPresets = next;
    return true;
  }

  switch (key) {
    case 'folder': return write('folder', text.trim().replace(/^\/+|\/+$/g, '') || 'Water Tracker');
    case 'goalMl': return write('goalMl', int(text, 2000));
    case 'cupMl': return write('cupMl', int(text, 250));
    case 'bottle': return write('bottle', bottleById(text).id);
    case 'unit': return write('unit', text === 'oz' ? 'oz' : 'ml');
    default: return false;
  }
}
