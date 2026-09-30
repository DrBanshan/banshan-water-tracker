/**
 * Validates manifest.json against what the Obsidian community store actually installs from.
 *
 * The store reads this file before it reads any code, so a missing field here is a rejected
 * submission that costs a round trip with a reviewer, and a wrong field is worse: it installs
 * a broken plugin for every user at once. Cheaper to fail here.
 *
 * Run directly for a report, or import it so the release build refuses to produce assets
 * from a manifest that would not be accepted.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const REQUIRED = ['id', 'name', 'version', 'minAppVersion', 'description', 'author'];
const SEMVER = /^\d+\.\d+\.\d+$/;
const ID = /^[a-z][a-z0-9-]*$/;
const DESCRIPTION_LIMIT = 300;

export function auditManifest(manifest, options = {}) {
  const { expectId, packageVersion } = options;
  const problems = [];

  for (const field of REQUIRED) {
    const value = manifest[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      problems.push(`${field} is required and must be a non-empty string`);
    }
  }

  if (typeof manifest.id === 'string' && !ID.test(manifest.id)) {
    problems.push(`id '${manifest.id}' must be lower case letters, digits and dashes`);
  }
  // The dev build writes into .obsidian/plugins/<id>/ and enables it under that same name.
  // Letting these disagree means Obsidian loads an older copy of the plugin and says nothing.
  if (expectId !== undefined && manifest.id !== expectId) {
    problems.push(`id '${manifest.id}' must match the id the build deploys under, '${expectId}'`);
  }

  if (typeof manifest.version === 'string' && !SEMVER.test(manifest.version)) {
    problems.push(`version '${manifest.version}' must be plain semver x.y.z, with no leading v`);
  }
  if (typeof manifest.minAppVersion === 'string' && !SEMVER.test(manifest.minAppVersion)) {
    problems.push(`minAppVersion '${manifest.minAppVersion}' must be plain semver x.y.z`);
  }

  if (typeof manifest.description === 'string' && manifest.description.length > DESCRIPTION_LIMIT) {
    problems.push(`description is ${manifest.description.length} characters, the store wants at most ${DESCRIPTION_LIMIT}`);
  }

  // The whole point of this plugin is that the same code runs on an iPhone.
  if (manifest.isDesktopOnly === true) {
    problems.push('isDesktopOnly is true, but this plugin supports iOS; the store would hide it from mobile users');
  }

  // Version living in two files is version living in two places. manifest.json is the source
  // of truth because that is the file Obsidian compares against for updates.
  if (packageVersion !== undefined && manifest.version !== packageVersion) {
    problems.push(
      `package.json says version '${packageVersion}' but manifest.json says '${manifest.version}'; run npm run version-bump`,
    );
  }

  return problems;
}

// Only walk the filesystem when this is the entry point, not when build.js imports it.
const invoked = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invoked) {
  let manifest;
  let packageVersion;
  try {
    manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  } catch (error) {
    console.error(`manifest.json could not be read as JSON: ${error.message}`);
    process.exit(1);
  }
  try {
    packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  } catch {
    console.warn('package.json unreadable; skipping the version agreement check');
  }

  const problems = auditManifest(manifest, { packageVersion });
  if (problems.length > 0) {
    console.error('manifest.json needs work:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(`manifest.json looks installable: ${manifest.id} ${manifest.version} for Obsidian ${manifest.minAppVersion}+`);
}
