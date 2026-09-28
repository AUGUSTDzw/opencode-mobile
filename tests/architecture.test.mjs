import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ratchets that keep the documented layering from eroding. When a limit is
// genuinely outgrown, move the code into the right layer (a domain hook, a
// service, or lib/) and lower the number here in the same change.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

async function collectSourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// 1. The provider orchestrates domains; it should not regrow into a god object.
const provider = await read('providers/opencode-provider.tsx');
const providerLines = provider.split('\n').length;
assert.ok(
  providerLines <= 3400,
  `providers/opencode-provider.tsx is ${providerLines} lines. Extract a domain into a providers/use-*-state.ts hook instead of growing the provider.`,
);

// 2. The public context surface stays a deliberate contract, not an accidental
// dump. Count members across every domain context value.
const types = await read('providers/opencode-provider-types.ts');
const domainBlocks = [...types.matchAll(/export type \w+ContextValue = \{([\s\S]*?)\n\};/g)];
assert.ok(domainBlocks.length >= 2, 'Domain context value types must exist.');
const contextMembers = domainBlocks.reduce(
  (total, match) => total + (match[1].match(/^  [a-zA-Z]+[?]?[:(]/gm) || []).length,
  0,
);
assert.ok(
  contextMembers <= 135,
  `The domain contexts expose ${contextMembers} members in total. Add a domain hook or provider action instead of widening them.`,
);

// 3. Screens and presentational components never reach the network directly.
const layerDirs = ['app', 'components'];
const networkCalls = /(^|[^\w.])fetch\s*\(|new XMLHttpRequest|from ['"]axios['"]/;
const offenders = [];
for (const dir of layerDirs) {
  for (const file of await collectSourceFiles(path.join(root, dir))) {
    if (networkCalls.test(await readFile(file, 'utf8'))) {
      offenders.push(path.relative(root, file));
    }
  }
}
assert.deepEqual(
  offenders,
  [],
  `Network calls belong in providers/services or lib, never in ${layerDirs.join('/')}: ${offenders.join(', ')}`,
);

console.log(`architecture checks passed (provider ${providerLines} lines, context ${contextMembers} members).`);
