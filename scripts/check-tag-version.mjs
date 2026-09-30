/**
 * The tag has to be the manifest version, and in the one shape Obsidian supports.
 *
 * From the submission guide: "Versions supported only in the format x.y.z", and "the 'Tag
 * version' of the release must match the version in your manifest.json" - because when a user
 * installs, Obsidian downloads main.js, manifest.json and styles.css from the GitHub release
 * whose tag equals the version in the manifest. So a tag that does not match is not cosmetic:
 * the download either finds the wrong release or finds no release at all, and it looks from the
 * user's side like the plugin never updated. A directory reviewer sees it as a failed check too.
 *
 * Hence no leading `v`, no `-rc.1`, no `+build.7`. Those are all normal git habits that this
 * particular contract does not allow, which is why they get their own complaints rather than a
 * single "not a version" message someone has to decode.
 */
import * as fs from 'fs';

const raw = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? '';
const { version } = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const tag = raw.replace(/^refs\/tags\//, ''); // tolerate being handed the ref instead of the name

const problems = [];
if (tag.length === 0) {
  problems.push('no tag was given; pass the tag name as an argument or run where GITHUB_REF_NAME is set');
} else if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(tag)) {
  problems.push(`'${tag}' is not a version Obsidian can resolve a release from`);
  if (/^v[0-9]/i.test(tag)) problems.push('a leading v is not allowed: the tag is the version itself');
  if (/[-+]/.test(tag)) problems.push('pre-release and build suffixes are not supported, only x.y.z');
  if (/^v?[0-9]+$/.test(tag)) problems.push('a bare number is not a version either, it wants x.y.z');
  problems.push(`for this manifest that means: git tag -a ${version} -m "${version}" && git push origin ${version}`);
} else if (tag !== version) {
  problems.push(`the tag is ${tag} while manifest.json says ${version}`);
  problems.push('Obsidian downloads the release whose tag equals the manifest version, so these two have to agree');
  problems.push(`either bump manifest.json to ${tag} and commit that, or tag ${version} instead of ${tag}`);
  problems.push(`and clear the tag you do not want: git push origin :refs/tags/${tag}`);
}

if (problems.length > 0) {
  console.error('The release tag and the manifest do not agree:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Tag ${tag} is the version in manifest.json`);
