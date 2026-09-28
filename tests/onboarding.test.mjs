import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Transpile `providers/onboarding-state.ts` and resolve its `@/` alias import to
// the real key module so the migration logic under test is the production one.
// The `PersistenceStorage` import is type-only and is erased by the transpiler.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

const storageKeysUri = `data:text/javascript,${encodeURIComponent(
  transpile(await readFile(path.join(root, 'lib/storage-keys.ts'), 'utf8')),
)}`;

const onboardingStateUri = `data:text/javascript,${encodeURIComponent(
  transpile(await readFile(path.join(root, 'providers/onboarding-state.ts'), 'utf8'))
    .replace(/from ['"]@\/lib\/storage-keys['"]/g, `from ${JSON.stringify(storageKeysUri)}`),
)}`;

const {
  CURRENT_ONBOARDING_VERSION,
  ONBOARDING_VERSION_IN_PROGRESS,
  hasExistingConfiguration,
  isOnboardingComplete,
  loadOnboardingStatus,
  parseOnboardingVersion,
  resolveOnboardingStatus,
  serializeOnboardingVersion,
} = await import(onboardingStateUri);

const { ONBOARDING_VERSION_STORAGE_KEY, SETTINGS_STORAGE_KEY, CONNECTION_PROFILES_STORAGE_KEY, ACTIVE_PROJECT_STORAGE_KEY } =
  await import(storageKeysUri);

// --- parser / serializer ---------------------------------------------------

assert.equal(parseOnboardingVersion(serializeOnboardingVersion(1)), 1);
assert.equal(parseOnboardingVersion('3'), 3, 'a bare number is accepted for forward compatibility');
assert.equal(parseOnboardingVersion('{"version":2}'), 2);
assert.throws(() => parseOnboardingVersion('{'), /malformed/i);
assert.throws(() => parseOnboardingVersion('"one"'), /invalid/i);
assert.throws(() => parseOnboardingVersion('-1'), /invalid/i);
assert.throws(() => parseOnboardingVersion('{"version":"1"}'), /invalid/i);

assert.equal(isOnboardingComplete(0), false);
assert.equal(isOnboardingComplete(CURRENT_ONBOARDING_VERSION), true);
assert.equal(isOnboardingComplete(CURRENT_ONBOARDING_VERSION + 1), true);
assert.equal(isOnboardingComplete(undefined), false);

assert.equal(hasExistingConfiguration({ hasStoredSettings: false, hasStoredProfiles: false, hasActiveProject: false }), false);
assert.equal(hasExistingConfiguration({ hasStoredSettings: true, hasStoredProfiles: false, hasActiveProject: false }), true);
assert.equal(hasExistingConfiguration({ hasStoredSettings: false, hasStoredProfiles: true, hasActiveProject: false }), true);
assert.equal(hasExistingConfiguration({ hasStoredSettings: false, hasStoredProfiles: false, hasActiveProject: true }), true);

// --- pure migration decision ----------------------------------------------

assert.deepEqual(
  resolveOnboardingStatus(undefined, { hasStoredSettings: false, hasStoredProfiles: false, hasActiveProject: false }),
  { completed: false, version: ONBOARDING_VERSION_IN_PROGRESS, shouldPersist: true },
  'a fresh install starts onboarding and records version 0',
);
assert.deepEqual(
  resolveOnboardingStatus(undefined, { hasStoredSettings: true, hasStoredProfiles: false, hasActiveProject: false }),
  { completed: true, version: CURRENT_ONBOARDING_VERSION, shouldPersist: true },
  'an existing settings key marks onboarding complete',
);
assert.deepEqual(
  resolveOnboardingStatus(0, { hasStoredSettings: true, hasStoredProfiles: true, hasActiveProject: true }),
  { completed: false, version: 0, shouldPersist: false },
  'an explicit in-progress marker is sticky even after configuration exists',
);
assert.deepEqual(
  resolveOnboardingStatus(CURRENT_ONBOARDING_VERSION, { hasStoredSettings: false, hasStoredProfiles: false, hasActiveProject: false }),
  { completed: true, version: CURRENT_ONBOARDING_VERSION, shouldPersist: false },
);

// --- storage-backed resolution ---------------------------------------------

function createStorage(initial = new Map(), failedReads = new Set()) {
  const removed = [];
  const values = new Map(initial);
  return {
    removed,
    values,
    async getItem(key) {
      if (failedReads.has(key)) throw new Error('read failed');
      return values.has(key) ? values.get(key) : null;
    },
    async removeItem(key) {
      removed.push(key);
      values.delete(key);
    },
  };
}

const fresh = await loadOnboardingStatus(createStorage());
assert.deepEqual(fresh, { completed: false, version: 0, shouldPersist: true });

const upgraded = await loadOnboardingStatus(createStorage(new Map([[SETTINGS_STORAGE_KEY, '{"serverUrl":"http://x"}']])));
assert.deepEqual(upgraded, { completed: true, version: CURRENT_ONBOARDING_VERSION, shouldPersist: true });

const profilesOnly = await loadOnboardingStatus(createStorage(new Map([[CONNECTION_PROFILES_STORAGE_KEY, '[]']])));
assert.equal(profilesOnly.completed, true);

const activeOnly = await loadOnboardingStatus(createStorage(new Map([[ACTIVE_PROJECT_STORAGE_KEY, '/repo']])));
assert.equal(activeOnly.completed, true);

const sticky = await loadOnboardingStatus(createStorage(new Map([
  [ONBOARDING_VERSION_STORAGE_KEY, serializeOnboardingVersion(0)],
  [SETTINGS_STORAGE_KEY, '{"serverUrl":"http://x"}'],
])));
assert.deepEqual(sticky, { completed: false, version: 0, shouldPersist: false });

const done = await loadOnboardingStatus(createStorage(new Map([
  [ONBOARDING_VERSION_STORAGE_KEY, serializeOnboardingVersion(CURRENT_ONBOARDING_VERSION)],
])));
assert.deepEqual(done, { completed: true, version: CURRENT_ONBOARDING_VERSION, shouldPersist: false });

const versionReadFailure = await loadOnboardingStatus(createStorage(
  new Map([[SETTINGS_STORAGE_KEY, '{}']]),
  new Set([ONBOARDING_VERSION_STORAGE_KEY]),
));
assert.deepEqual(
  versionReadFailure,
  { completed: true, version: CURRENT_ONBOARDING_VERSION, shouldPersist: false },
  'a storage failure never onboards an existing user and does not persist a decision',
);

const evidenceReadFailure = await loadOnboardingStatus(createStorage(new Map(), new Set([SETTINGS_STORAGE_KEY])));
assert.deepEqual(evidenceReadFailure, { completed: true, version: CURRENT_ONBOARDING_VERSION, shouldPersist: false });

const malformed = await loadOnboardingStatus(createStorage(new Map([[ONBOARDING_VERSION_STORAGE_KEY, '{']])));
assert.deepEqual(malformed, { completed: false, version: 0, shouldPersist: true });

const malformedStorage = createStorage(new Map([[ONBOARDING_VERSION_STORAGE_KEY, '{']]));
await loadOnboardingStatus(malformedStorage);
assert.deepEqual(malformedStorage.removed, [ONBOARDING_VERSION_STORAGE_KEY], 'malformed marker is removed');

console.log('onboarding state tests passed');
