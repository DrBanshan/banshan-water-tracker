/**
 * Terminal preview of the bottle artwork, for judging silhouettes without opening Obsidian.
 *   npm run silhouette            every style, at 55% full
 *   npm run silhouette -- sport   one style
 *   npm run silhouette -- sport 0.9
 * Filled cells are glass, `~` is water, and the marks are the extra paths: = rim, B base line,
 * | graduation, C cap, S stopper, w clasp wire, o shine.
 */
import { BOTTLE_STYLES, tickValues, waterLevelY } from '../src/bottles.ts';

const CELL_W = 46;
const CELL_H = 44;
const BOX = { minX: 8, maxX: 112, minY: 0, maxY: 224 };

function flatten(path) {
  const tokens = path.match(/[MLCQVHZ]|-?\d*\.?\d+/g) ?? [];
  const pts = [];
  let i = 0;
  let x = 0;
  let y = 0;
  const next = () => Number(tokens[i++]);
  const start = [0, 0];
  while (i < tokens.length) {
    const head = tokens[i];
    if (!/^[A-Za-z]$/.test(head ?? '')) { i += 1; continue }
    i += 1;
    if (head === 'M' || head === 'L') {
      const px = x;
      const py = y;
      x = next(); y = next();
      if (head === 'L') {
        for (let step = 1; step <= 40; step += 1) pts.push([px + ((x - px) * step) / 40, py + ((y - py) * step) / 40]);
      } else if (pts.length === 0) {
        start[0] = x; start[1] = y;
      }
      if (pts.length === 0) start[0] = x;
      if (pts.length === 0) start[1] = y;
    } else if (head === 'C') {
      const c1x = next(), c1y = next(), c2x = next(), c2y = next(), ex = next(), ey = next();
      for (let step = 1; step <= 40; step += 1) {
        const t = step / 40;
        const mt = 1 - t;
        pts.push([
          mt ** 3 * x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t ** 3 * ex,
          mt ** 3 * y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t ** 3 * ey,
        ]);
      }
      x = ex; y = ey;
    } else if (head === 'Q') {
      const cx = next(), cy = next(), ex = next(), ey = next();
      for (let step = 1; step <= 40; step += 1) {
        const t = step / 40;
        const mt = 1 - t;
        pts.push([mt * mt * x + 2 * mt * t * cx + t * t * ex, mt * mt * y + 2 * mt * t * cy + t * t * ey]);
      }
      x = ex; y = ey;
    } else if (head === 'Z') {
      pts.push([start[0], start[1]]);
    }
  }
  return pts;
}

function cell(px, py) {
  return [
    Math.round(((px - BOX.minX) / (BOX.maxX - BOX.minX)) * (CELL_W - 1)),
    Math.round(((py - BOX.minY) / (BOX.maxY - BOX.minY)) * (CELL_H - 1)),
  ];
}

function blank() {
  const grid = [];
  for (let row = 0; row < CELL_H; row += 1) {
    const line = [];
    for (let col = 0; col < CELL_W; col += 1) line.push(' ');
    grid.push(line);
  }
  return grid;
}

function stroke(grid, path, ch) {
  for (const [px, py] of flatten(path)) {
    const [gx, gy] = cell(px, py);
    if (gx >= 0 && gx < CELL_W && gy >= 0 && gy < CELL_H) grid[gy][gx] = ch;
  }
}

/** Even-odd scanline fill of a closed, already-flattened polygon. */
function fill(grid, pts, ch, belowY, overwrite) {
  for (let row = 0; row < CELL_H; row += 1) {
    const worldY = BOX.minY + (row / (CELL_H - 1)) * (BOX.maxY - BOX.minY);
    if (belowY !== undefined && worldY < belowY) continue;
    const crossings = [];
    for (let index = 0; index + 1 < pts.length; index += 1) {
      const [, ay] = pts[index];
      const [bx, by] = pts[index + 1];
      if (ay === by) continue;
      if ((ay <= worldY && by > worldY) || (by <= worldY && ay > worldY)) {
        const [ax] = pts[index];
        crossings.push(ax + ((worldY - ay) / (by - ay)) * (bx - ax));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const [left] = cell(crossings[pair], worldY);
      const [right] = cell(crossings[pair + 1], worldY);
      for (let col = Math.max(0, left); col <= Math.min(CELL_W - 1, right); col += 1) {
        if (overwrite || grid[row][col] === ' ') grid[row][col] = ch;
      }
    }
  }
}

function clipBelow(pts, level) {
  const out = [];
  for (let index = 0; index + 1 < pts.length; index += 1) {
    const [ax, ay] = pts[index];
    const [bx, by] = pts[index + 1];
    const ain = ay >= level;
    const bin = by >= level;
    if (ain) out.push([ax, ay]);
    if (ain !== bin) {
      const t = (level - ay) / (by - ay);
      out.push([ax + t * (bx - ax), level]);
    }
  }
  if (out.length > 2) out.push(out[0]);
  return out;
}

function draw(style, fraction) {
  const grid = blank();
  const level = waterLevelY(style, fraction);
  const shell = flatten(style.body);
  fill(grid, shell, '.', fraction > 0 ? undefined : -Infinity);
  if (fraction > 0) fill(grid, clipBelow(flatten(style.clip ?? style.body), level), '~', undefined, true);
  stroke(grid, style.base ?? '', 'B');
  stroke(grid, style.rim ?? '', '=');
  for (const mark of tickValues(2500)) {
    if (style.ticks === 'none') break;
    stroke(grid, `M${style.tickX - 12} ${waterLevelY(style, mark.fraction)} L${style.tickX} ${waterLevelY(style, mark.fraction)}`, '|');
  }
  stroke(grid, style.body, '#');
  const art = (style.decor + (style.rim ?? '') + (style.base ?? ''));
  for (const path of art.matchAll(/class="([^"]*)"[^>]*d="([^"]+)"/g) ?? []) {
    const ch = path[1].includes('wt-wire') ? 'w' : path[1].includes('wt-shine') ? 'o' : path[1].includes('wt-base') ? 'B' : '=';
    stroke(grid, path[2], ch);
  }
  for (const rect of style.decor.matchAll(/<rect[^>]*>/g) ?? []) {
    const ch = rect[0].includes('wt-stopper') ? 'S' : 'C';
    const x = Number(/x="([\d.]+)"/.exec(rect[0])?.[1]);
    const y = Number(/y="([\d.]+)"/.exec(rect[0])?.[1]);
    const w = Number(/width="([\d.]+)"/.exec(rect[0])?.[1]);
    const h = Number(/height="([\d.]+)"/.exec(rect[0])?.[1]);
    stroke(grid, `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`, ch);
  }
  return [level, grid.map((row) => ' |' + row.join('') + '| ').join('\n')];
}

const wanted = process.argv[2];
const fraction = Number(process.argv[3] ?? 0.55);
for (const style of BOTTLE_STYLES) {
  if (wanted && style.id !== wanted) continue;
  const xs = flatten(style.body).map((point) => point[0]);
  const ys = flatten(style.body).map((point) => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const [level, art] = draw(style, fraction);
  console.log(
    `\n${style.name} [${style.id}]  ${Math.round(fraction * 100)}% full, water surface y=${level.toFixed(0)}\n` +
    `body ${width} x ${height} viewBox units (ratio ${(width / height).toFixed(2)}, ticks ${style.ticks})\n${art}`,
  );
}
