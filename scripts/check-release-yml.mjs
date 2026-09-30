/**
 * Guard rails for .github/workflows/release.yml, run by that workflow itself.
 *
 * This is not a YAML parser and does not validate the file against GitHub's schema - Actions'
 * own parser stays the authority on that. What it does is catch the handful of mistakes that in a
 * release workflow cost more than a red build: a published release built from the wrong thing.
 * Those mistakes are all reference mistakes, and references are checkable without a parser:
 *
 *  - a `uses:` ref that is not owner/repo@something will fail the job midway, after the tag is
 *    public and cannot be unsent;
 *  - an `npm run <script>` naming a script that does not exist;
 *  - an `assets:` list that no longer matches the three files Obsidian installs - too few and
 *    every user gets a broken plugin, too many and we are shipping strays;
 *  - the trigger widened from version tags back to "any tag", which is what lets a stray tag
 *    publish a release.
 *
 * Run with --assets after the build, so the paths handed to the uploader are checked on disk.
 */
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW = path.join('.github', 'workflows', 'release.yml');
const PUBLISHER = 'softprops/auto-action-release';
const PUBLISHED = ['main.js', 'manifest.json', 'styles.css'];
const NPM_BUILT_INS = new Set(['ci', 'test', 'install', 'i', 'ls', 'run']);
const ACTIONS_STEP_KEYS = new Set(['tag', 'commit', 'draft', 'prerelease', 'name', 'assets']);

const problems = [];
const fail = (message) => problems.push(message);

if (!fs.existsSync(WORKFLOW)) {
  console.error(`There is no ${WORKFLOW} to check`);
  process.exit(1);
}

const source = fs.readFileSync(WORKFLOW, 'utf8');
const lines = source.split('\n');

// --- the file has to be something Actions can read at all -------------------------------
lines.forEach((line, index) => {
  const where = `${WORKFLOW}:${index + 1}`;
  if (line.includes('\t')) fail(`${where} has a tab; YAML wants spaces`);
  if (line.endsWith('\r')) fail(`${where} ends with a carriage return`);
});
for (const key of ['on:', 'jobs:', 'runs-on:', 'steps:']) {
  if (!source.includes(key)) fail(`the workflow has no ${key} block any more`);
}
if (!/'\[0-9\]\*'/.test(source)) {
  fail(`${WORKFLOW} no longer triggers on '[0-9]*'; publishing must be limited to version tags`);
}

// --- references have to point at things that exist -------------------------------------
const scripts = new Set(Object.keys(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts ?? {}));

for (const [, ref] of source.matchAll(/(?:^|\s)-\s*uses:\s*([^\s#]+)/gm)) {
  if (ref.startsWith('./')) continue;
  if (!/^[\w.-]+\/[\w.-]+@[\w.-]+$/.test(ref)) {
    fail(`'${ref}' is not a usable action reference; it wants owner/repo@ref`);
  }
}

for (const [, command] of source.matchAll(/^\s*(?:-\s+)?run:\s*(.+)$/gm)) {
  for (const [, script] of command.matchAll(/\bnpm\s+run\s+([a-z0-9_.-]+)/g)) {
    if (!scripts.has(script)) fail(`the workflow runs 'npm run ${script}', which package.json does not define`);
  }
  for (const [, verb] of command.matchAll(/\bnpm\s+([a-z][a-z0-9-]*)/g)) {
    if (!NPM_BUILT_INS.has(verb) && !scripts.has(verb)) {
      fail(`the workflow runs 'npm ${verb}', which is neither an npm command nor a script`);
    }
  }
}

// --- the publish step has to be the step that knows what it is publishing ---------------
// Steps are read as blocks rather than by indentation alone. Every step's `with:` sits at the
// same depth, so a flat indentation match hands the release action setup-node's inputs and then
// rightly complains about a file that is fine - a gate that does that gets switched off.
function readSteps() {
  const found = [];
  let current = null;
  let insideWith = false;
  for (const line of lines) {
    if (/^ {6}-\s/.test(line)) {
      current = { uses: '', inputs: new Map() };
      found.push(current);
      insideWith = false;
    } else if (!line.startsWith(' ') && line.trim().length > 0) {
      current = null;
    }
    if (current === null) continue;

    const uses = /^ {6}-\s*uses:\s*([^\s#]+)/.exec(line) ?? /^ {8}uses:\s*([^\s#]+)/.exec(line);
    if (uses !== null) {
      current.uses = uses[1];
      insideWith = false;
      continue;
    }
    if (/^ {8}with:\s*$/.test(line)) {
      insideWith = true;
      continue;
    }
    if (!insideWith) continue;
    if (/^ {6,8}\S/.test(line)) {
      insideWith = false;
      continue;
    }
    const key = /^ {10}([a-z-]+):\s*(.*)$/.exec(line);
    if (key !== null) current.inputs.set(key[1], key[2]);
  }
  return found;
}

const publish = readSteps().find((step) => step.uses.startsWith(PUBLISHER));
if (publish === undefined) {
  fail(`no step uses ${PUBLISHER}, so nothing would ever be published`);
} else {
  for (const required of ['tag', 'assets']) {
    if (!publish.inputs.has(required)) fail(`the publish step is missing its '${required}' input`);
  }
  for (const key of publish.inputs.keys()) {
    if (!ACTIONS_STEP_KEYS.has(key)) fail(`the publish step passes '${key}', which is not an input of ${PUBLISHER}`);
  }
  if (publish.inputs.get('draft') !== undefined && publish.inputs.get('draft') !== 'false') {
    fail(`the publish step sets draft '${publish.inputs.get('draft')}', which leaves a tag public with no release behind it`);
  }
}

// --- what gets uploaded, and whether it is really there ---------------------------------
const listed = (publish?.inputs.get('assets') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

if (listed.length > 0) {
  const names = listed.map((entry) => path.basename(entry)).sort();
  if (names.join() !== [...PUBLISHED].sort().join()) {
    fail(`the release uploads ${names.join(', ') || '(nothing)'}, but Obsidian installs ${PUBLISHED.join(', ')}`);
  }
}

if (process.argv.includes('--assets')) {
  for (const entry of listed) {
    if (!fs.existsSync(entry)) fail(`${entry} is listed for upload but was never built`);
  }
  for (const wanted of PUBLISHED) {
    if (!listed.some((entry) => path.basename(entry) === wanted)) fail(`${wanted} is not listed for upload`);
  }
}

if (problems.length > 0) {
  console.error(`${WORKFLOW} needs work:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  process.argv.includes('--assets')
    ? `Release workflow checks out, and ${listed.join(', ')} are on disk`
    : 'Release workflow checks out against package.json and the expected asset set',
);
