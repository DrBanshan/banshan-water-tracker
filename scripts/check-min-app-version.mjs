/**
 * Works out, out of the SDK's own annotations, the oldest Obsidian this plugin can honestly
 * claim to support - and then holds the manifest to it.
 *
 * The community reviewer reports "uses Obsidian APIs newer than the declared minAppVersion" as
 * an error, and it deserves to be an error: that field is the promise about which installs get
 * the plugin, and every call to something newer than the promise is a code path that meets
 * undefined on somebody's phone. Obsidian records the answer as `@since` on each declaration in
 * the typings, so it can be settled here rather than by a user discovering it.
 *
 * The lookup goes through the type checker rather than by matching names, and that matters.
 * `setValue` names a method that has been on SettingComponent since the beginning and also one
 * that arrived on DisplayValueComponent in 1.13.1; matched by name the plugin looks like it
 * needs 1.13.1, and matched by type it says what it really means. Names also drag in the
 * opposite error - our own `width`, `start` and `id` fields collide with unrelated SDK members -
 * so every symbol here is resolved to the file that declared it before it is believed.
 *
 * minAppVersion is a floor, not a target. Declaring a higher one than the code needs does not
 * strengthen anything; it only turns people away, so it is reported as a note and left to the
 * author who has to run the result.
 */
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

const TYPEINGS = path.join('node_modules', 'obsidian', 'obsidian.d.ts');
const SOURCE_DIR = 'src';

const cmp = (a, b) => {
  const left = (a ?? '0.0.0').split('.').map(Number);
  const right = (b ?? '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const at = i;
    if ((left[at] ?? 0) !== (right[at] ?? 0)) return (left[at] ?? 0) < (right[at] ?? 0) ? -1 : 1;
  }
  return 0;
};

if (!fs.existsSync(TYPEINGS)) {
  console.error(`There is no ${TYPEINGS} to read the @since annotations out of`);
  process.exit(1);
}

// The program has to be built the way the project builds itself, or the symbols it resolves are
// not the symbols the plugin ships with. The convenience parsers TypeScript advertises for this
// are not exposed by this SDK build, so the handful of options that can change what resolves are
// read from tsconfig.json and looked up in the enums by their key. CreateProgram rejects the
// strings the JSON file carries, so the lookup has to land on the enum value itself.
const RAW = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8')).compilerOptions ?? {};
const byName = (table, value, fallback) => {
  const wanted = String(value ?? '').toLowerCase();
  const key = Object.keys(table).find((name) => name.toLowerCase() === wanted);
  return key === undefined ? fallback : table[key];
};
const options = {
  module: byName(ts.ModuleKind, RAW.module, ts.ModuleKind.ESNext),
  target: byName(ts.ScriptTarget, RAW.target, ts.ScriptTarget.ES2022),
  moduleResolution: byName(ts.ModuleResolutionKind, RAW.moduleResolution, ts.ModuleResolutionKind.Bundler),
  strict: RAW.strict === true,
  noImplicitAny: RAW.noImplicitAny === true,
  esModuleInterop: RAW.esModuleInterop !== false,
  skipLibCheck: true,
  noEmit: true,
};
// lib decides which globals exist, not how old an SDK symbol is, so it is left to the defaults.
// Anything else in the file that could change resolution has to be looked at by a person.
const MAPPED = new Set(['module', 'target', 'moduleResolution', 'strict', 'noImplicitAny', 'esModuleInterop', 'skipLibCheck', 'noEmit', 'lib']);
const RESOLUTION_KEY = new Set(['types', 'typesrootdirs', 'baseurl', 'paths', 'packageresolution', 'allowarbitraryextensions']);
for (const key of Object.keys(RAW)) {
  if (MAPPED.has(key.toLowerCase())) continue;
  if (RESOLUTION_KEY.has(key.toLowerCase())) {
    console.log(`Note: tsconfig.json sets ${key}, which this script does not replay; resolved SDK symbols may differ from the real build.`);
  }
}

const roots = fs.readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.ts')).map((name) => path.join(SOURCE_DIR, name));
const program = ts.createProgram(roots, options);
const checker = program.getTypeChecker();

const typingsFile = program.getSourceFiles().find((file) => file.fileName.endsWith('obsidian.d.ts'));
if (typingsFile === undefined) {
  console.error('the SDK typings are not part of the program, so nothing here can be aged');
  process.exit(1);
}
const typingsLines = typingsFile.text.split('\n');

/** The @since in the comment block immediately above a line of the typings, if there is one. */
function sinceAbove(lineIndex) {
  for (let i = lineIndex - 1; i >= 0 && lineIndex - i <= 25; i -= 1) {
    const line = typingsLines[i];
    if (/^\s*$/.test(line)) continue;
    if (!/^\s*(\*|\*\/)/.test(line)) return null; // the comment block has ended
    const since = /@since\s+([0-9]+\.[0-9]+\.[0-9]+)/.exec(line);
    if (since) return since[1];
  }
  return null;
}

/** Zero based line of the typings file a node sits on, counted from the text itself. */
const lineAt = (node) => typingsFile.text.slice(0, node.getStart()).split('\n').length - 1;

/** An SDK symbol's age: its own @since, or the one above the class that owns it. */
function ageOf(symbol) {
  const declaration = (symbol?.declarations ?? [])[0];
  // No declarations means the symbol was conjured, which happens when a receiver types as any and
  // the checker resolves a name against everything at once. Such a thing is not the SDK's.
  if (declaration === undefined) return undefined;
  const sourceFile = declaration.getSourceFile?.();
  if (sourceFile === undefined || !sourceFile.fileName.endsWith('obsidian.d.ts')) return undefined; // ours, not the SDK's
  const here = lineAt(declaration);
  const direct = sinceAbove(here);
  if (direct !== null) return direct;
  // Members are usually annotated themselves; when they are not, the class they live on is.
  const owner = declaration.parent;
  if (owner !== undefined && ts.isClassDeclaration?.(owner) !== true && ts.isInterfaceDeclaration?.(owner) !== true) return null;
  return owner === undefined ? null : sinceAbove(lineAt(owner));
}

const ownerOf = (symbol) => {
  const declaration = (symbol?.declarations ?? [])[0];
  const owner = declaration?.parent;
  if (owner === undefined || !ts.isClassDeclaration?.(owner) && !ts.isInterfaceDeclaration?.(owner)) return null;
  return String(owner.name?.text ?? '');
};

const found = new Map(); // name -> { since, owner }
const undated = new Set();

const record = (symbol, label) => {
  if (symbol === undefined || symbol === null) return;
  if (typeof label !== 'string' || label.length === 0 || label.startsWith('undefined')) return;
  const since = ageOf(symbol);
  if (since === undefined) return; // declared in this project, so it ages with the project
  if (since === null) { undated.add(label); return }
  const best = found.get(label);
  if (best === undefined || cmp(since, best.since) > 0) found.set(label, { since, owner: ownerOf(symbol) });
};

/** The member a receiver type really resolves to, which is not the same thing as its name. */
const memberOf = (node, name) => {
  const receiver = checker.getTypeAtLocation(node);
  if (receiver === undefined || receiver === null) return undefined;
  // Only a real property counts. An index signature is not the member we asked about, and
  // pretending otherwise attributes somebody else's symbol to one of our own field names.
  return receiver.getProperty?.(name);
};

for (const file of program.getSourceFiles().filter((source) => source.fileName.startsWith(SOURCE_DIR.replaceAll('\\', '/')) || source.fileName.includes(`${SOURCE_DIR}/`))) {
  const walk = (node) => {
    if (ts.isPropertyAccessExpression?.(node)) {
      const name = node.name.text;
      // Deliberatly no fallback to node.symbol: when the receiver is any, TypeScript will find
      // some symbol of that name from anywhere in the program, and one of our field names gets
      // reported as a borrowed SDK member. Unresolved means not claimed.
      record(memberOf(node.expression, name), name);
    } else if (ts.isIdentifier(node)) {
      // Bare names are the SDK's classes and functions: new Notice(...), debounce(...), Plugin.
      const parent = node.parent;
      if (parent !== undefined && (ts.isImportSpecifier?.(parent) === true || parent.name === node || parent.type === node)) return;
      record(node.symbol ?? (typeof checker.getSymbolAtLocation === 'function' ? checker.getSymbolAtLocation(node) : undefined), node.text);
    } else if (ts.isClassDeclaration?.(node) && node.heritageClauses !== undefined) {
      // An override is not a call. Implementing getSettingDefinitions() on a build that never had
      // it fails nowhere until the settings screen opens, so base members are aged too.
      for (const heritage of node.heritageClauses) {
        for (const type of heritage.types) {
          const baseType = checker.getTypeAtLocation(type);
          for (const member of node.members) {
            // Only methods are hooks the host calls back, so only methods age the plugin. A
            // property you declare on your own subclass shadows whatever the base happens to
            // name, which is a naming question, not a version requirement - counting it would
            // push the floor up for somebody else's choice of words.
            if (!ts.isMethodDeclaration?.(member)) continue;
            const name = String(member.name?.getText?.(file) ?? '').replaceAll('[', '').replaceAll(']', '');
            if (name === 'constructor') continue;
            const symbol = baseType?.getProperty?.(name);
            if (symbol !== undefined) record(symbol, `${name} (override)`);
          }
        }
      }
    }
    node.forEachChild?.(walk);
  };
  walk(file);
}

const problems = [];
// A scanner that resolved nothing is not a clean bill, it is a broken scanner. This has to fail
// loudly, because every other line it prints reads like an all clear.
if (found.size === 0 && undated.size === 0) {
  console.error(`no Obsidian API was resolved at all out of ${roots.length} source files, so this report would mean nothing`);
  process.exit(1);
}
const ranked = [...found.entries()]
  .map(([name, entry]) => ({ name, ...entry }))
  .sort((a, b) => cmp(b.since, a.since));

const required = ranked.length > 0 ? ranked[0].since : '0.0.0';
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const declared = manifest.minAppVersion;
const sdkVersion = JSON.parse(fs.readFileSync(path.join('node_modules', 'obsidian', 'package.json'), 'utf8')).version;

if (typeof declared !== 'string') {
  problems.push('manifest.json has no minAppVersion to hold the code to');
} else if (cmp(declared, required) < 0) {
  problems.push(`manifest.json promises Obsidian ${declared}, but the code calls APIs that arrived in ${required}`);
  for (const entry of ranked.filter((item) => cmp(item.since, declared) > 0).slice(0, 10)) {
    problems.push(`${entry.name}${entry.owner ? ` (${entry.owner})` : ''} arrived in ${entry.since}`);
  }
  problems.push(`so either raise minAppVersion to ${required} or stop calling what does not exist yet`);
}

if (cmp(required, sdkVersion) > 0) {
  problems.push(`the code needs ${required}, which is newer than the installed SDK typings (${sdkVersion}); raise the devDependency before promising it`);
}

const newest = ranked.filter((entry) => cmp(entry.since, '1.0.0') > 0).slice(0, 6);
if (newest.length > 0) {
  console.log('Newest Obsidian APIs in use:');
  for (const entry of newest) console.log(`  ${entry.since.padEnd(9)} ${entry.name}${entry.owner ? ` (${entry.owner})` : ''}`);
}
if (undated.size > 0) {
  console.log(`Note: ${[...undated].join(', ')} carry no @since in the typings, so they are assumed old enough.`);
}

if (problems.length === 0 && typeof declared === 'string' && cmp(declared, required) > 0) {
  const caveat = undated.size > 0 ? ` (members with no @since at all are assumed old, so ${required} is a lower bound)` : '';
  console.log(
    `Note: minAppVersion is ${declared}, but nothing the code calls arrived after ${required}${caveat}. `
    + `Anyone on ${required} through ${declared} could run this and is not being offered it.`,
  );
}

if (problems.length > 0) {
  console.error('The declared minimum app version does not match what the code uses:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`minAppVersion ${declared} covers every Obsidian API in use; the floor it could be lowered to is ${required}`);
