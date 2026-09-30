/**
 * Guard rails for .github/workflows/release.yml, run by that workflow itself.
 *
 * This is not a YAML parser, and it does not validate the file against GitHub's schema - the
 * Actions parser stays the authority on whether the file loads. What it does is watch the handful
 * of things in a release workflow whose failure costs more than a red build, because they reach
 * people who already installed the plugin:
 *
 *  - the release tag, the manifest version and the three uploaded files having to agree;
 *  - the gates running before anything is created rather than after, which is the difference
 *    between a gate and a post-mortem;
 *  - references (action names, npm script names) that would otherwise fail halfway through a run
 *    whose tag is already public and cannot be unsent.
 *
 * The file is read as text on purpose: a YAML dependency would validate syntax while saying
 * nothing about the things above, and syntax is the part GitHub already checks for free.
 */
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW = path.join('.github', 'workflows', 'release.yml');
const PUBLISHED = ['main.js', 'manifest.json', 'styles.css'];
const NPM_BUILT_INS = new Set(['ci', 'test', 'install', 'i', 'ls', 'run']);
// What String.prototype.matchAll needs. Below this the build and the scripts die, which is how
// the guide's own 18.x pin ends up pasted in and then blamed on the plugin.
const MIN_NODE = 22;

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
for (const key of ['on:', 'jobs:', 'runs-on:', 'steps:', 'permissions:']) {
  if (!source.includes(key)) fail(`the workflow has no ${key} block any more`);
}

// --- steps, read as blocks ---------------------------------------------------------------
// Read per step rather than by global indentation: every step's `with:` sits at the same depth,
// so a flat match hands one action another action's inputs and then reports a fault in a file
// that is fine. A gate that cries wolf gets muted, which is worse than not having it.
function readSteps() {
  const steps = [];
  let current = null;
  let mode = null; // 'with' | 'run' | 'subject-path'
  let modeIndent = 0;

  const closeBlock = () => { mode = null; };

  lines.forEach((line, index) => {
    const stepStart = /^ {6}-\s(.*)$/.exec(line);
    if (stepStart) {
      current = { at: index + 1, uses: '', name: '', run: '', inputs: new Map(), envs: new Map() };
      steps.push(current);
      const inline = /^uses:\s*(\S+)/.exec(stepStart[1]);
      if (inline) current.uses = inline[1];
      mode = null;
      return;
    }
    if (current === null || line.trim().length === 0) return;

    const key = /^ {8}([a-z-]+):(.*)$/.exec(line);
    if (key) {
      const [, name, rest] = key;
      mode = null;
      if (name === 'uses') current.uses = rest.trim();
      if (name === 'name') current.name = rest.trim();
      if (name === 'run') {
        const isBlock = /^\s*[|>][-+]?/.test(rest);
        current.run = isBlock ? '' : rest.trim();
        if (isBlock) { mode = 'run'; modeIndent = 10; }
      }
      if (name === 'with') { mode = 'with'; modeIndent = 10; }
      if (name === 'env') { mode = 'env'; modeIndent = 10; }
      return;
    }

    if (mode === null) return;
    const indent = line.length - line.trimStart().length;

    if (mode === 'run') {
      if (indent >= modeIndent) current.run += `${line.trimStart()}\n`;
      else mode = null;
      return;
    }

    if (mode === 'env') {
      const pair = /^ {10}([A-Z_a-z]+):\s*(.*)$/.exec(line);
      if (pair !== null) current.envs.set(pair[1], pair[2].trim());
      else if (indent < 10) mode = null;
      return;
    }

    // inside a with: block
    const inputKey = /^ {10}([a-z_-]+):\s*(.*)$/.exec(line);
    if (inputKey !== null) {
      const [, name, value] = inputKey;
      if (/[|>][-+]?\s*$/.test(value)) {
        mode = name; // the value is a block that follows on deeper lines
        modeIndent = 12;
        current.inputs.set(name, '');
      } else {
        current.inputs.set(name, value.trim());
      }
      return;
    }
    if (indent >= 12 && mode !== 'with') {
      const held = current.inputs.get(mode) ?? '';
      current.inputs.set(mode, `${held}${line.trimStart()}\n`);
    } else if (indent < 10) {
      mode = 'with';
    }
  });

  return steps;
}

const steps = readSteps();

// --- references have to point at things that exist -------------------------------------
for (const step of steps) {
  if (step.uses.length === 0) continue;
  if (step.uses.startsWith('./')) continue;
  if (!/^[\w.-]+\/[\w.-]+@[\w.-]+$/.test(step.uses)) {
    fail(`'${step.uses}' is not a usable action reference; it wants owner/repo@ref`);
    continue;
  }
  if (/^actions\/(checkout|setup-node)@v[12]$/.test(step.uses)) {
    fail(`${step.uses} is long past its life; the runners are on v4 or newer`);
  }
}

const scripts = new Set(Object.keys(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts ?? {}));
for (const step of steps) {
  for (const [, script] of step.run.matchAll(/\bnpm\s+run\s+([a-z0-9_.-]+)/g)) {
    if (!scripts.has(script)) fail(`the workflow runs 'npm run ${script}', which package.json does not define`);
  }
  for (const [, verb] of step.run.matchAll(/\bnpm\s+([a-z][a-z0-9-]*)/g)) {
    if (!NPM_BUILT_INS.has(verb) && !scripts.has(verb)) {
      fail(`the workflow runs 'npm ${verb}', which is neither an npm command nor a script`);
    }
  }
}

// --- the runtime has to be one this repository's own code runs on ----------------------
const setupNodes = steps.filter((step) => step.uses.startsWith('actions/setup-node'));
const nodePins = steps.map((step) => step.inputs.get('node-version')).filter((pin) => pin !== undefined);
if (setupNodes.length === 0) fail('nothing installs Node, so whatever version the runner happens to have decides what builds your plugin');
else if (nodePins.length === 0) fail('the setup-node step pins no node-version, so the runner decides what builds your plugin');
else {
  const major = Number((nodePins[0] ?? '').match(/(\d+)/)?.[1] ?? 0);
  if (major < MIN_NODE) {
    fail(`node-version ${nodePins[0]} is below ${MIN_NODE}; this build uses String.prototype.matchAll and would not run at all`);
  }
}

// --- the tag has to be held against the manifest, before anything is published ---------
const tagGate = steps.find((step) => step.run.includes('check-tag-version'));
if (tagGate === undefined) {
  fail('nothing checks the tag against manifest.json, yet the store downloads the release whose tag equals that version');
} else {
  if (!tagGate.run.includes('GITHUB_REF')) fail('the tag check does not read the tag from the event, so it could be handed any string');
}

const publisher = steps.find((step) => step.run.includes('gh release create'));
if (publisher === undefined) {
  fail('no step creates the release, so a published tag would produce nothing users can install');
} else {
  if (!publisher.run.includes('--draft')) fail('the release is created without --draft; a release that turns out wrong is already telling every install there is an update');
  if (!/--title=/.test(publisher.run)) fail('the release is created without --title, leaving the tag as the only thing naming it');
  if (!publisher.envs.has('GITHUB_TOKEN') && !publisher.envs.has('GH_TOKEN') && !publisher.run.includes('GH_TOKEN')) {
    fail('the release step has no GITHUB_TOKEN in its environment, so gh cannot authenticate and the job dies on its last step');
  }

  const assets = [...publisher.run.matchAll(/(?<![\w/.-])([\w./-]+\.(?:js|json|css))\b/g)].map(([, name]) => name);
  if (assets.join() !== PUBLISHED.join()) fail(`the release uploads ${assets.join(', ') || '(nothing)'}, but Obsidian installs ${PUBLISHED.join(', ')}`);
}

// --- the attestation the community directory asks for ----------------------------------
const attestation = steps.find((step) => /attest/.test(step.uses));
if (attestation === undefined) {
  fail('there is no attestation step; build provenance for the release files is what the submission review asks for');
} else {
  const subjects = (attestation.inputs.get('subject-path') ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (subjects.join() !== PUBLISHED.join()) {
    fail(`the attestation covers ${subjects.join(', ') || '(nothing)'}, but the files that ship are ${PUBLISHED.join(', ')}`);
  }
  for (const key of attestation.inputs.keys()) {
    if (key !== 'subject-path') fail(`the attestation step passes '${key}', which is not an input the action documents`);
  }
}

// --- order: the gates have to come before the publishing, not afterwards ---------------
const indexOf = (predicate) => steps.findIndex((step) => predicate(step));
const firstIndex = (predicate) => steps.reduce((best, step, index) => best ?? (predicate(step) ? index : null), null);
const publishAt = firstIndex((step) => step.run.includes('gh release create') || /attest/.test(step.uses));
for (const [label, predicate] of [
  ['the tag check', (step) => step.run.includes('check-tag-version')],
  ['the build', (step) => step.run.includes('npm run release')],
]) {
  const at = firstIndex(predicate);
  if (at === null) continue; // already reported as missing above
  if (publishAt !== null && at > publishAt) fail(`${label} runs after the release is created, which makes it a post-mortem rather than a gate`);
}
if (indexOf((step) => step.run.includes('check-release-yml')) === -1) {
  fail('the self-check step is gone, so nothing will notice when this file and the project drift apart');
}

// --- the permissions the two publishing steps need -------------------------------------
// Matched as `key: write` on its own line rather than as a substring, so a comment mentioning
// permissions can not satisfy a requirement the runner enforces.
for (const key of ['contents', 'id-token', 'attestations']) {
  if (!new RegExp(`^\\s+${key}:\\s*write\\s*$`, 'm').test(source)) {
    fail(`the job does not declare ${key}: write, and ${key === 'contents' ? 'creating the release' : 'signing the build'} will be refused`);
  }
}

// --- every script the workflow names has to be a script that exists --------------------
// A renamed or mistyped file name here looks exactly like a working gate right up to the moment
// the step dies on "cannot find module" - after the build, and possibly after the release.
for (const step of steps) {
  for (const [script] of step.run.matchAll(/scripts\/[\w.-]+\.(?:mjs|cjs|js|ts)\b/g)) {
    if (!fs.existsSync(script)) fail(`the workflow runs ${script}, which is not in the repository`);
  }
}

// --- whether the trigger is the one that fails loudly rather than silently skip --------
const tagFilter = /\n\s+tags:\s*\n\s*-\s*(\S+)/.exec(source)?.[1];
if (tagFilter === undefined) fail('there is no tag trigger any more, so no push can ever start a release');
else if (tagFilter.replaceAll('"', '') !== '*') {
  fail(`the trigger is narrowed to ${tagFilter}; a mistyped tag would then be ignored in silence instead of failing here`);
}

// --- and the files themselves, once the build has produced them ------------------------
if (process.argv.includes('--assets')) {
  for (const wanted of PUBLISHED) {
    if (!fs.existsSync(wanted)) fail(`${wanted} is not at the repository root for the release to upload`);
  }
}

if (problems.length > 0) {
  console.error(`${WORKFLOW} needs work:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  process.argv.includes('--assets')
    ? `Release workflow checks out, and ${PUBLISHED.join(', ')} are at the repository root`
    : 'Release workflow checks out against package.json, the manifest contract and the expected asset set',
);
