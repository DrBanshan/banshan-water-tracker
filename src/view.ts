import { ItemView, setIcon } from 'obsidian';
import {
  cupDistribution,
  headline,
  heatLevel,
  monthGrid,
  weekdayPattern,
  WEEKDAY_LABELS,
} from './analytics';
import { bottleById, bottleTree, mountShape, tickValues, waterLevelY } from './bottles';
import { addDays, dateKey, dayTotals, daysApart, displayAmount, drinksInRange, formatAmount, keyToDate, marksEditedDay, monthKey, stripHasToSlide, windowDays } from './model';
import type { DaySummary } from './store';
import type { WaterSettings } from './types';
import type WaterTrackerPlugin from './main';

export const VIEW_TYPE_WATER_TRACKER = 'banshan-water-tracker-view';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CHART_DAYS = 30;
/** The streak can outlive the chart window, so history is read a good deal further back. */
const HISTORY_DAYS = 90;

let uidSeed = 0;

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+$)/g, ',');
}

interface Styleable {
  style: CSSStyleDeclaration;
}

type Panel = 'drink' | 'analysis';

export class WaterTrackerView extends ItemView {
  plugin: WaterTrackerPlugin;
  private panel: Panel = 'drink';
  private tabButtons: Record<Panel, HTMLElement | null> = { drink: null, analysis: null };
  private drinkPanelEl: HTMLElement | null = null;
  private analysisPanelEl: HTMLElement | null = null;
  private bottleWrap: HTMLElement | null = null;
  private waterEl: Styleable | null = null;
  /** Everything the drawn artwork depends on: style, goal, unit and the printed graduations. */
  private drawnKey: string | null = null;
  private readoutEl: HTMLElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private chartEl: HTMLElement | null = null;
  private dayNavEl: HTMLElement | null = null;
  /** The day the bottle, the quick buttons and Undo are aimed at. Defaults to today. */
  private editing: Date = new Date();

  // Obsidian hands us a WorkspaceLeaf; its type isn't usable from the plugin side.
  constructor(leaf: { view: unknown }, plugin: WaterTrackerPlugin) {
    super(leaf as never);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_WATER_TRACKER;
  }

  getDisplayText(): string {
    return 'Water Tracker';
  }

  getIcon(): string {
    return 'droplet';
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: 'wt-root' });

    const tabs = root.createDiv({ cls: 'wt-tabs', attr: { role: 'tablist' } });
    this.tabButtons.drink = this.makeTab(tabs, 'drink', 'Drink');
    this.tabButtons.analysis = this.makeTab(tabs, 'analysis', 'Analysis');

    const drink = root.createDiv({ cls: 'wt-panel', attr: { role: 'tabpanel' } });
    this.drinkPanelEl = drink;
    const bottle = drink.createDiv({ cls: 'wt-bottle-wrap', attr: { role: 'button', tabindex: '0' } });
    bottle.setAttr('aria-label', 'Add a cup of water');
    bottle.addEventListener('click', () => void this.plugin.addCup(this.plugin.settings.cupMl, this.editing));
    bottle.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void this.plugin.addCup(this.plugin.settings.cupMl, this.editing);
      }
    });
    this.bottleWrap = bottle;
    this.readoutEl = drink.createDiv({ cls: 'wt-readout' });
    this.controlsEl = drink.createDiv({ cls: 'wt-controls' });
    this.chartEl = drink.createDiv({ cls: 'wt-charts' });
    this.dayNavEl = drink.createDiv({ cls: 'wt-daynav' });

    this.analysisPanelEl = root.createDiv({ cls: 'wt-panel', attr: { role: 'tabpanel' } });

    this.showPanel();
    await this.render();
  }

  private makeTab(parent: HTMLElement, panel: Panel, label: string): HTMLElement {
    const button = parent.createDiv({ cls: 'wt-tab', text: label, attr: { role: 'tab' } });
    button.addEventListener('click', () => {
      if (this.panel === panel) return;
      this.panel = panel;
      this.showPanel();
      void this.render();
    });
    return button;
  }

  private showPanel(): void {
    for (const key of ['drink', 'analysis'] as Panel[]) {
      const button = this.tabButtons[key];
      if (button) button.toggleClass('wt-tab-active', this.panel === key);
      button?.setAttr('aria-selected', this.panel === key ? 'true' : 'false');
    }
    this.drinkPanelEl?.toggleClass('is-hidden', this.panel !== 'drink');
    this.analysisPanelEl?.toggleClass('is-hidden', this.panel !== 'analysis');
  }

  async render(): Promise<void> {
    const settings = this.plugin.settings;
    const now = new Date();
    const selectedKey = dateKey(this.editing);
    // The read window has to reach far enough back that the day being edited is still inside it once
    // the 30 day strip slides, or that column would read as zero instead of as what was logged.
    const back = Math.max(0, daysApart(this.editing, now));
    const span = Math.max(HISTORY_DAYS, back + CHART_DAYS);
    const { rows, texts } = await this.plugin.store.readWindow(span, now);
    const goal = Math.max(1, settings.goalMl);
    const totals = new Map<string, number>(rows.map((row) => [row.key, row.total]));
    const shown = totals.get(selectedKey) ?? 0;
    const recent = rows.slice(-CHART_DAYS);

    this.paintBottle(settings, shown, goal);
    this.paintReadout(settings, shown, goal);
    this.paintControls(settings);
    this.paintCharts(totals, goal, now, selectedKey);
    this.paintAnalysis(recent, rows, goal, now, texts);
    this.paintDayNav(now, selectedKey, back);
  }

  /** The bottle starts empty; each logged entry raises the level by that entry's amount. */
  private paintBottle(settings: WaterSettings, shown: number, goal: number): void {
    const style = bottleById(settings.bottle);
    if (!this.bottleWrap) return;

    const marks = tickValues(goal);
    // The goal and the unit belong in this key, not just the style id: without them a bottle
    // drawn under an old goal keeps its old numbers no matter how often the view repaints.
    const key = `${style.id}|${goal}|${settings.unit}|${marks.map((mark) => mark.ml).join(',')}`;
    if (this.drawnKey !== key) {
      uidSeed += 1;
      const uid = String(uidSeed);
      // The drawing is mounted element by element from the same tree the tests read, so a
      // graduation label that came out of settings reaches the page as a text node and never as
      // markup something has to parse.
      this.bottleWrap.empty();
      mountShape(
        this.bottleWrap,
        bottleTree(style, uid, marks.map((mark) => ({ fraction: mark.fraction, label: displayAmount(mark.ml, settings.unit) }))),
      );
      this.waterEl = this.bottleWrap.querySelector('.wt-water') as unknown as Styleable;
      this.drawnKey = key;
    }

    const y = waterLevelY(style, shown / goal);
    if (this.waterEl) this.waterEl.style.transform = `translate(0px, ${y}px)`;
    this.bottleWrap.toggleClass('wt-is-empty', shown <= 0);
    this.bottleWrap.toggleClass('wt-is-full', shown >= goal);
  }

  private paintReadout(settings: WaterSettings, shown: number, goal: number): void {
    const el = this.readoutEl;
    if (!el) return;
    el.empty();
    el.toggleClass('wt-met', shown >= goal);
    el.createDiv({ cls: 'wt-total', text: `${group(shown)} / ${group(goal)} ${settings.unit}` });
    el.createDiv({ cls: 'wt-percent', text: `${Math.round((shown / goal) * 100)}%` });
    if (shown >= goal) {
      el.createDiv({ cls: 'wt-over', text: `+${group(shown - goal)} ${settings.unit} over goal` });
    } else {
      el.createDiv({ cls: 'wt-left', text: `${group(goal - shown)} ${settings.unit} to go` });
    }
    if (shown === 0) el.createDiv({ cls: 'wt-hint', text: 'Tap the bottle to add a cup' });
  }

  private paintControls(settings: WaterSettings): void {
    const el = this.controlsEl;
    if (!el) return;
    el.empty();

    for (const ml of settings.cupPresets) {
      const button = el.createDiv({ cls: 'wt-btn', text: `${displayAmount(ml, settings.unit)} ${settings.unit}` });
      button.addEventListener('click', () => void this.plugin.addCup(ml, this.editing));
    }
    const undo = el.createDiv({ cls: 'wt-btn wt-btn-ghost', text: 'Undo' });
    undo.addEventListener('click', () => void this.plugin.undoLast(this.editing));
  }

  private paintCharts(totals: Map<string, number>, goal: number, now: Date, selectedKey: string): void {
    const el = this.chartEl;
    if (!el) return;
    el.empty();
    const todayKey = dateKey(now);

    el.createDiv({ cls: 'wt-section', text: 'Last 7 days' });
    this.barGroup(el, windowDays(totals, now, 7), goal, {
      labelled: true,
      todayKey,
      selectedKey,
      onPick: (key) => {
        this.editing = keyToDate(key);
        void this.render();
      },
    });

    // The strip is meant to hold the day you are editing, so it slides back with you rather than
    // leaving the marker nowhere to go. Once slid it is no longer the trailing 30 days and says so.
    const slid = stripHasToSlide(selectedKey, todayKey, CHART_DAYS);
    el.createDiv({
      cls: 'wt-section',
      text: slid ? `Last ${CHART_DAYS} days up to ${dateKey(this.editing)}` : `Last ${CHART_DAYS} days`,
    });
    this.barGroup(el, windowDays(totals, slid ? this.editing : now, CHART_DAYS), goal, {
      labelled: false,
      todayKey,
      selectedKey,
    });
  }

  private barGroup(
    parent: HTMLElement,
    days: DaySummary[],
    goal: number,
    options: { labelled: boolean; todayKey: string; selectedKey: string; onPick?: (key: string) => void },
  ): void {
    const wrap = parent.createDiv({ cls: options.labelled ? 'wt-bars wt-bars-labelled' : 'wt-bars' });

    for (const day of days) {
      const column = wrap.createDiv({ cls: 'wt-col' });
      const bar = column.createDiv({ cls: 'wt-bar' });
      bar.style.height = `${Math.round(Math.min(1, day.total / goal) * 100)}%`;
      bar.toggleClass('wt-bar-met', day.total >= goal);
      bar.setAttr('title', `${day.key} ${formatAmount(day.total, this.plugin.settings.unit)}`);

      if (options.labelled) {
        const label = column.createDiv({
          cls: day.key === options.todayKey ? 'wt-bar-label wt-bar-today' : 'wt-bar-label',
          text: WEEKDAY[keyToDate(day.key).getDay()] ?? '',
        });
        // The weekday goes bold for whichever day is being edited, which is the one place that tells
        // you the bottle above is showing that day and not today.
        label.toggleClass('wt-bar-selected', day.key === options.selectedKey);
        if (options.onPick) {
          const pick = options.onPick;
          column.toggleClass('wt-col-pick', true);
          column.setAttr('title', `Edit ${day.key}`);
          column.addEventListener('click', () => pick(day.key));
        }
      }

      // The marker only means something while you are away from today: it is what tells you this
      // column is the one under edit, and it disappears the moment you land back on today.
      const marked = !options.labelled && marksEditedDay(day.key, options.selectedKey, options.todayKey);
      if (marked) column.createDiv({ cls: 'wt-tri', attr: { 'aria-hidden': 'true' } });
    }
  }

  private paintDayNav(now: Date, selectedKey: string, back: number): void {
    const el = this.dayNavEl;
    if (!el) return;
    el.empty();

    const before = el.createDiv({ cls: 'wt-btn wt-btn-ghost wt-daynav-btn', attr: { 'aria-label': 'Edit the day before' } });
    setIcon(before, 'chevron-left');
    before.addEventListener('click', () => {
      this.editing = addDays(this.editing, -1);
      void this.render();
    });

    const label = el.createDiv({ cls: 'wt-daynav-label' });
    label.createDiv({ cls: 'wt-daynav-title', text: back === 0 ? 'Today' : 'Editing' });
    label.createDiv({ cls: 'wt-daynav-date', text: back === 0 ? dateKey(now) : selectedKey });

    // Forward has a floor of today on purpose. A cup at 23:59 of a day that has not arrived would be
    // a claim about the future, and the charts would then count a day that has not happened.
    const after = el.createDiv({ cls: 'wt-btn wt-btn-ghost wt-daynav-btn', attr: { 'aria-label': 'Edit the day after' } });
    setIcon(after, 'chevron-right');
    if (back === 0) {
      after.toggleClass('is-inert', true);
      after.setAttr('aria-disabled', 'true');
    } else {
      after.addEventListener('click', () => {
        const candidate = addDays(this.editing, 1);
        if (daysApart(candidate, new Date()) < 0) return;
        this.editing = candidate;
        void this.render();
      });
    }
  }

  private paintAnalysis(recent: DaySummary[], history: DaySummary[], goal: number, now: Date, texts: Map<string, string>): void {
    const el = this.analysisPanelEl;
    const settings = this.plugin.settings;
    if (!el) return;
    el.empty();

    const stats = headline(recent, goal, now, history);
    const cards = el.createDiv({ cls: 'wt-cards' });
    this.statCard(cards, 'Streak', `${stats.streak}`, stats.streak === 1 ? 'day' : 'days');
    this.statCard(cards, 'Goal met', `${stats.hitRate}%`, `${stats.daysLogged} of ${stats.days} days`);
    this.statCard(cards, 'Daily avg', group(stats.average), settings.unit);
    this.statCard(cards, 'Best day', stats.best ? group(stats.best.total) : '0', stats.best ? `${settings.unit} on ${stats.best.key.slice(5)}` : `${settings.unit} yet`);

    // ---- weekday rhythm -------------------------------------------------
    el.createDiv({ cls: 'wt-section', text: 'When you drink' });
    const peaks = weekdayPattern(recent);
    const top = Math.max(1, ...peaks.map((peak) => peak.average));
    const week = el.createDiv({ cls: 'wt-week' });
    for (const peak of peaks) {
      const row = week.createDiv({ cls: 'wt-week-row' });
      row.createDiv({ cls: 'wt-week-label', text: WEEKDAY_LABELS[peak.index] ?? '' });
      const track = row.createDiv({ cls: 'wt-week-track' });
      const fill = track.createDiv({ cls: 'wt-week-fill' });
      fill.style.width = `${Math.round((peak.average / top) * 100)}%`;
      fill.toggleClass('wt-week-weak', peak.average < goal);
      row.createDiv({ cls: 'wt-week-value', text: peak.average > 0 ? group(peak.average) : '-' });
    }

    // ---- month heat grid ------------------------------------------------
    const month = monthKey(now);
    el.createDiv({ cls: 'wt-section', text: `${month.slice(0, 4)}-${month.slice(5)} calendar` });
    const grid = el.createDiv({ cls: 'wt-heat' });
    for (const head of WEEKDAY_LABELS) grid.createDiv({ cls: 'wt-heat-head', text: head });
    const totals = dayTotals(texts.get(month) ?? '');
    for (const cell of monthGrid(totals, now.getFullYear(), now.getMonth() + 1)) {
      grid.createDiv({
        cls: cell.blank ? 'wt-heat-cell is-blank' : `wt-heat-cell wt-h${heatLevel(cell.total, goal)}`,
        text: cell.blank ? '' : String(cell.day),
        attr: cell.blank ? undefined : { title: `${cell.key}: ${formatAmount(cell.total, settings.unit)}` },
      });
    }

    // ---- which cup actually gets used -----------------------------------
    const keys = new Set(recent.map((day) => day.key));
    const usage = cupDistribution(drinksInRange(texts, keys));
    el.createDiv({ cls: 'wt-section', text: 'Cups you reach for' });
    if (usage.length === 0) {
      el.createDiv({ cls: 'wt-empty', text: 'Nothing logged in the last 30 days yet.' });
      return;
    }
    const list = el.createDiv({ cls: 'wt-cups' });
    const biggest = usage[0].count;
    for (const cup of usage.slice(0, 5)) {
      const row = list.createDiv({ cls: 'wt-cup-row' });
      row.createDiv({ cls: 'wt-cup-name', text: `${displayAmount(cup.ml, settings.unit)} ${settings.unit}` });
      const track = row.createDiv({ cls: 'wt-cup-track' });
      track.createDiv({ cls: 'wt-cup-fill' }).style.width = `${Math.round((cup.count / biggest) * 100)}%`;
      row.createDiv({ cls: 'wt-cup-count', text: `${cup.count} x ${cup.share}%` });
    }
  }

  private statCard(parent: HTMLElement, label: string, value: string, foot: string): void {
    const card = parent.createDiv({ cls: 'wt-card' });
    card.createDiv({ cls: 'wt-card-label', text: label });
    card.createDiv({ cls: 'wt-card-value', text: value });
    card.createDiv({ cls: 'wt-card-foot', text: foot });
  }
}
