import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appDir, '../../..');
const sourceDir = resolve(
  repoRoot,
  'openspec/changes/define-anecdotia-family-story-mvp/pilot-data',
);
const targetDir = resolve(repoRoot, 'apps/anecdotia/public/pilot-data');

const passthroughFiles = [
  'seed-anecdotes.obrach.local.md',
  'invite-list.obrach.local.md',
];

const rosterFile = 'roster.obrach.local.json';

mkdirSync(targetDir, { recursive: true });

let copied = 0;

const rosterSource = resolve(sourceDir, rosterFile);
const rosterTarget = resolve(targetDir, rosterFile);

if (existsSync(rosterSource)) {
  const roster = JSON.parse(readFileSync(rosterSource, 'utf8'));
  const sanitizedRoster = {
    circle: roster.circle,
    people: Array.isArray(roster.people)
      ? roster.people.map((person) => ({
          localId: person.localId,
          displayName: person.displayName,
          aliases: Array.isArray(person.aliases) ? person.aliases : [],
          relationshipHint: person.relationshipHint,
          status: person.status,
        }))
      : [],
  };

  writeFileSync(rosterTarget, `${JSON.stringify(sanitizedRoster, null, 2)}\n`);
  copied += 1;
  console.info(`[anecdotia] synced sanitized ${rosterFile}`);
} else {
  console.warn(`[anecdotia] skipped missing private pilot file: ${rosterFile}`);
}

for (const file of passthroughFiles) {
  const source = resolve(sourceDir, file);
  const target = resolve(targetDir, file);

  if (!existsSync(source)) {
    console.warn(`[anecdotia] skipped missing private pilot file: ${file}`);
    continue;
  }

  copyFileSync(source, target);
  copied += 1;
  console.info(`[anecdotia] synced ${file}`);
}

if (copied === 0) {
  console.warn('[anecdotia] no private pilot data was synced.');
} else {
  console.info(`[anecdotia] synced ${copied} private pilot file(s).`);
}
