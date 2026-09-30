/**
 * Copies the version from manifest.json into package.json.
 *
 * manifest.json is the source of truth, because that is the file Obsidian itself reads when it
 * decides whether an update exists. package.json carries a version only so tooling that expects
 * one is not handed undefined - and two hand-edited copies of a number drift, so one of them is
 * written rather than kept.
 *
 * The file is edited in place rather than parsed and re-emitted, so running this never reflows
 * unrelated keys or the indentation someone chose.
 */
import * as fs from 'fs';
import * as path from 'path';

const SEMVER = /^\d+\.\d+\.\d+$/;

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8'));
const version = manifest.version;

if (typeof version !== 'string' || !SEMVER.test(version)) {
  console.error(`manifest.json version '${version}' is not x.y.z; refusing to write it anywhere`);
  process.exit(1);
}

const packagePath = path.join(process.cwd(), 'package.json');
const source = fs.readFileSync(packagePath, 'utf8');
const current = /"version":\s*"([^"]*)"/.exec(source)?.[1];

if (current === version) {
  console.log(`package.json already carries ${version}`);
  process.exit(0);
}

let written;
if (current === undefined) {
  // No version key at all: put it straight after the opening brace, where npm would have put it.
  const indent = /^([ \t]*)"[a-z-]+":/m.exec(source)?.[1] ?? '  ';
  written = source.replace(/^{\n/, `{\n${indent}"version": "${version}",\n`);
} else {
  written = source.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
}

if (written === source) {
  console.error('could not find a place to write the version in package.json');
  process.exit(1);
}

fs.writeFileSync(packagePath, written);
console.log(`package.json version set to ${version}, taken from manifest.json`);
