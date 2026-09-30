import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const WATCH = process.argv.includes('--watch');
const ID = 'banshan-water-tracker';
// Test vault the plugin gets pushed to for manual checking. Change this one line if the vault moves.
const TEST_VAULT = 'D:/Projects/ob-plugin-dev';

function deploy() {
  const dir = path.join(TEST_VAULT, '.obsidian', 'plugins', ID);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    const src = path.join('.obsidian', 'plugins', ID, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, file));
  }
  // Enable it, otherwise Obsidian just sits there ignoring the folder.
  const list = path.join(TEST_VAULT, '.obsidian', 'community-plugins.json');
  try {
    const enabled = JSON.parse(fs.readFileSync(list, 'utf8'));
    const ids = Array.isArray(enabled) ? enabled : (enabled.plugins ?? []);
    if (!ids.includes(ID)) {
      ids.push(ID);
      fs.writeFileSync(list, JSON.stringify(Array.isArray(enabled) ? ids : enabled, null, 2) + '\n');
      console.log('Enabled ' + ID + ' in the test vault');
    }
  } catch (e) {
    console.warn('Could not update community-plugins.json:', e.message);
  }
  console.log('Deployed to ' + dir);
}

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: '.obsidian/plugins/' + ID + '/main.js',
    external: ['obsidian'],
    format: 'cjs',
    platform: 'browser',
    target: 'es2018',
    minify: true,
    sourcemap: false,
    logLevel: 'info',
    plugins: [
      {
        name: 'copy-manifest',
        setup(build) {
          build.onEnd(() => {
            const manifestSrc = 'manifest.json';
            const manifestDst = '.obsidian/plugins/' + ID + '/manifest.json';
            if (fs.existsSync(manifestSrc)) {
              fs.copyFileSync(manifestSrc, manifestDst);
              console.log('Copied manifest.json');
            }
          });
        }
      },
      {
        name: 'copy-css',
        setup(build) {
          build.onEnd(() => {
            const cssSrc = 'src/styles.css';
            const cssDst = '.obsidian/plugins/' + ID + '/styles.css';
            if (fs.existsSync(cssSrc)) {
              fs.copyFileSync(cssSrc, cssDst);
              console.log('Copied styles.css');
            }
            deploy();
          });
        }
      }
    ]
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

build().catch(e => {
  console.error(e);
  process.exit(1);
});
