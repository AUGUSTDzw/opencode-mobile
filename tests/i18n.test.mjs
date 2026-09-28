import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const localesDir = fileURLToPath(new URL('lib/i18n/locales', root));

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const INTERPOLATION_PATTERN = /{{\s*([^},\s]+)[^}]*}}/g;

function flatten(value, prefix = '', out = {}) {
  for (const [key, child] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, nextKey, out);
    } else {
      out[nextKey] = child;
    }
  }
  return out;
}

function interpolations(value) {
  const found = new Set();
  if (typeof value !== 'string') {
    return found;
  }
  for (const match of value.matchAll(INTERPOLATION_PATTERN)) {
    found.add(match[1]);
  }
  return found;
}

function pluralBase(key) {
  const index = key.lastIndexOf('_');
  if (index === -1) {
    return undefined;
  }
  const suffix = key.slice(index + 1);
  return PLURAL_SUFFIXES.includes(suffix) ? key.slice(0, index) : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function loadLanguages() {
  const entries = await readdir(localesDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

const languages = await loadLanguages();
assert.ok(languages.includes('en'), 'English (en) must exist as the source locale.');

const namespaces = (await readdir(path.join(localesDir, 'en')))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();

assert.ok(namespaces.length > 0, 'English must define at least one namespace.');

const sourceFlat = {};
for (const namespace of namespaces) {
  sourceFlat[namespace] = flatten(await readJson(path.join(localesDir, 'en', `${namespace}.json`)));
}

for (const language of languages) {
  if (language === 'en') {
    continue;
  }

  const requiredPlurals = new Set(
    new Intl.PluralRules(language).resolvedOptions().pluralCategories,
  );

  for (const namespace of namespaces) {
    const languageFlat = flatten(await readJson(path.join(localesDir, language, `${namespace}.json`)));
    const sourceKeys = Object.keys(sourceFlat[namespace]).sort();
    const languageKeys = Object.keys(languageFlat).sort();

    const missing = sourceKeys.filter((key) => !(key in languageFlat));
    const extra = languageKeys.filter((key) => !(key in sourceFlat[namespace]));
    assert.equal(missing.length, 0, `${language}/${namespace} is missing keys: ${missing.join(', ')}`);
    assert.equal(extra.length, 0, `${language}/${namespace} has unknown keys: ${extra.join(', ')}`);

    for (const key of sourceKeys) {
      const sourceVars = interpolations(sourceFlat[namespace][key]);
      const languageVars = interpolations(languageFlat[key]);
      assert.deepEqual(
        [...languageVars].sort(),
        [...sourceVars].sort(),
        `${language}/${namespace}.${key} has mismatched interpolation variables.`,
      );

      const base = pluralBase(key);
      if (base && languageFlat[key]) {
        const siblingCategories = new Set(
          languageKeys
            .filter((candidate) => pluralBase(candidate) === base)
            .map((candidate) => candidate.slice(base.length + 1)),
        );
        for (const category of requiredPlurals) {
          assert.ok(
            siblingCategories.has(category),
            `${language}/${namespace}.${base} is missing required plural category "${category}".`,
          );
        }
      }
    }
  }
}

// resolveLanguage is pure and import-free, so transpile and import it directly.
const languagesSource = await readFile(new URL('lib/i18n/languages.ts', root), 'utf8');
const languagesOutput = ts.transpileModule(languagesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { resolveLanguage, SUPPORTED_LANGUAGE_CODES } = await import(
  `data:text/javascript,${encodeURIComponent(languagesOutput)}`
);

assert.equal(resolveLanguage(undefined, ['en-US']), 'en', 'en-US device tag resolves to en.');
assert.equal(resolveLanguage('es', ['fr-FR']), 'es', 'Supported preference wins over the device.');
assert.equal(resolveLanguage(undefined, ['pt-BR']), 'pt', 'Device region tag resolves by base language.');
assert.equal(resolveLanguage(undefined, ['zh-Hans-CN']), 'zh', 'Device tag resolves by base language for script tags.');
assert.equal(resolveLanguage('ru', ['xx-YY']), 'en', 'Unsupported preference and device fall back to en.');
assert.equal(resolveLanguage(undefined, ['xx-YY']), 'en', 'Unsupported device language falls back to en.');
assert.equal(resolveLanguage('EN', []), 'en', 'Preference matching is case-insensitive.');
assert.ok(SUPPORTED_LANGUAGE_CODES.includes('en'), 'English must be a supported language.');
assert.ok(SUPPORTED_LANGUAGE_CODES.length >= 2, 'At least one non-English language must be supported.');

console.log(`i18n checks passed for ${languages.length} locale(s) and ${namespaces.length} namespace(s).`);
