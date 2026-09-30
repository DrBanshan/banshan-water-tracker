import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import childProcess from 'node:child_process';
import { auditManifest } from './scripts/audit-manifest.mjs';

const WATCH = process.argv.includes('--watch');
const RELEASE = process.argv.includes('--release');
if (RELEASE && WATCH) {
  // Watching keeps writing into the dev vault and never into release/, so the pair would look
  // like it was producing a shippable bundle while it rebuilt a folder nobody is reading.
  console.error('--watch rebuilds the dev vault build; --release writes a shippable bundle once. Pick one.');
  process.exit(1);
}
const ID = 'banshan-water-tracker';
// The three files Obsidian installs, and nothing else.
const ASSETS = ['main.js', 'manifest.json', 'styles.css'];
// Development vault the plugin is pushed to for manual checking. Change this line if it moves.
const TEST_VAULT = 'D:/Projects/ob-plugin-dev';
// Where the files land. A release goes to the repository root, which is where Obsidian's own
// release workflow points at them: both `actions/attest` and `gh release create` take the three
// names as bare paths, and bare paths are what keep the uploaded asset names identical to the
// names the store later downloads. A dev build goes straight into your vault.
const OUT_DIR = RELEASE ? '.' : `.obsidian/plugins/${ID}`;
// The manifest is authored, not generated: in release mode it already sits at the root, and
// copying a file onto itself fails for a reason that has nothing to do with your code.
const GENERATED = ['main.js', 'styles.css'];

function isTracked(name) {
  const listed = childProcess.spawnSync('git', ['ls-files', '--', name], { encoding: 'utf8' });
  return listed.status === 0 && listed.stdout.trim().length > 0;
}

function check() {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  let packageVersion;
  try {
    packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  } catch {
    packageVersion = undefined;
  }

  const problems = auditManifest(manifest, { expectId: ID, packageVersion });
  if (problems.length === 0) return manifest;

  // A release is what users receive, so an unshippable manifest stops it there. In development
  // the same findings are noise worth hearing but not worth halting a working loop for, except
  // the id: when that disagrees with the folder Obsidian loads, it silently runs a stale build.
  const fatal = RELEASE || problems.some((problem) => problem.includes('must match the id'));
  const say = fatal ? console.error : console.warn;
  say(fatal ? 'The manifest needs work:' : 'The manifest has problems:');
  for (const problem of problems) say(`  - ${problem}`);
  if (fatal) process.exit(1);
  return manifest;
}

function deploy() {
  const dir = path.join(TEST_VAULT, '.obsidian', 'plugins', ID);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of ASSETS) {
    fs.copyFileSync(path.join(OUT_DIR, file), path.join(dir, file));
  }

  // Enable it, otherwise Obsidian just sits there ignoring the folder.
  const list = path.join(TEST_VAULT, '.obsidian', 'community-plugins.json');
  try {
    const enabled = JSON.parse(fs.readFileSync(list, 'utf8'));
    const ids = Array.isArray(enabled) ? enabled : (enabled.plugins ?? []);
    if (!ids.includes(ID)) {
      ids.push(ID);
      fs.writeFileSync(list, JSON.stringify(Array.isArray(enabled) ? ids : enabled, null, 2) + '\n');
      console.log(`Enabled ${ID} in the dev vault`);
    }
  } catch (error) {
    console.warn(`Could not update community-plugins.json: ${error.message}`);
  }
  console.log(`Deployed to ${dir}`);
}

async function build() {
  const manifest = check();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (RELEASE) {
    // Start from nothing, so a bundle left over from an earlier version cannot ride along in the
    // release. And refuse to write over tracked files: these two names land at the repository
    // root among real source, and quietly replacing one of those is a bad way to learn about it.
    const tracked = GENERATED.filter((name) => isTracked(name));
    if (tracked.length > 0) {
      console.error(`${tracked.join(', ')} is tracked at the repository root; the release build writes generated files there and will not overwrite source`);
      process.exit(1);
    }
    for (const name of GENERATED) {
      if (fs.existsSync(name)) fs.rmSync(name);
    }
  }

  const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: path.join(OUT_DIR, 'main.js'),
    external: ['obsidian'],
    format: 'cjs',
    platform: 'browser',
    target: 'es2018',
    minify: true,
    sourcemap: false,
    logLevel: 'info',
    plugins: [
      {
        name: 'collect-assets',
        setup(pluginBuild) {
          pluginBuild.onEnd((result) => {
            if (result.errors.length > 0) return;
            // In release mode the manifest at the root is the artifact, so it is read from there
            // and never rewritten; a dev build needs a copy sitting next to the bundle.
            if (!RELEASE) fs.copyFileSync('manifest.json', path.join(OUT_DIR, 'manifest.json'));
            fs.copyFileSync('src/styles.css', path.join(OUT_DIR, 'styles.css'));

            if (RELEASE) {
              const missing = ASSETS.filter((file) => !fs.existsSync(path.join(OUT_DIR, file)));
              if (missing.length > 0) {
                console.error(`Release is missing ${missing.join(', ')}`);
                process.exit(1);
              }
              console.log(`Release ready for ${manifest.id} ${manifest.version}: ${ASSETS.join(', ')}`);
            } else {
              deploy();
            }
          });
        },
      },
    ],
  });

  if (WATCH) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete');
  }
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
