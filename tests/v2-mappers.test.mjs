import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/opencode/v2-mappers.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { modelToV1, projectToV1, sessionToV1 } = await import(`data:text/javascript,${encodeURIComponent(output)}`);

// Session usage fields must survive the V2 -> V1 mapping or the usage sheet
// cannot resolve a context limit (regression guard for PR #49).
const session = sessionToV1({
  id: 'ses_1',
  projectID: 'project-1',
  title: 'Chat',
  agent: 'build',
  model: { id: 'sonnet', providerID: 'anthropic' },
  cost: 0.42,
  tokens: { input: 1200, output: 240, reasoning: 10, cache: { read: 800, write: 100 } },
  time: { created: 1, updated: 2 },
});
assert.deepEqual(session.model, { id: 'sonnet', providerID: 'anthropic' });
assert.equal(session.agent, 'build');
assert.equal(session.cost, 0.42);
assert.deepEqual(session.tokens, { input: 1200, output: 240, reasoning: 10, cache: { read: 800, write: 100 } });
assert.equal(session.title, 'Chat');
assert.deepEqual(session.time, { created: 1, updated: 2 });

const minimalSession = sessionToV1({ id: 'ses_2', projectID: 'project-1', cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: 0, updated: 0 } });
assert.equal(minimalSession.title, '');
assert.equal(minimalSession.model, undefined);

assert.deepEqual(projectToV1({ id: 'project-1', canonical: '/workspace/demo', vcs: 'git', time: { created: 1, updated: 2 }, sandboxes: [] }), {
  id: 'project-1',
  worktree: '/workspace/demo',
  vcs: 'git',
  time: { created: 1, initialized: 2 },
});

function model(overrides = {}) {
  return {
    id: 'anthropic/sonnet',
    modelID: 'sonnet',
    providerID: 'anthropic',
    name: 'Sonnet',
    capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
    variants: [],
    time: { released: 0 },
    cost: [{ input: 3, output: 15, cache: { read: 0.3, write: 3.75 } }],
    status: 'active',
    enabled: true,
    limit: { context: 200000, output: 8192 },
    ...overrides,
  };
}

const mapped = modelToV1(model({
  cost: [
    { input: 3, output: 15, cache: { read: 0.3, write: 3.75 } },
    { tier: { type: 'context', size: 200000 }, input: 6, output: 22.5, cache: { read: 0.6, write: 7.5 } },
  ],
  variants: [{ id: 'high', settings: { reasoningEffort: 'high' } }],
}));
assert.equal(mapped.id, 'sonnet');
assert.equal(mapped.capabilities.reasoning, true);
assert.equal(mapped.capabilities.attachment, true);
assert.equal(mapped.capabilities.toolcall, true);
assert.deepEqual(mapped.capabilities.input, { text: true, audio: false, image: true, video: false, pdf: false });
assert.deepEqual(mapped.limit, { context: 200000, output: 8192 });
assert.deepEqual(mapped.cost, {
  input: 3,
  output: 15,
  cache: { read: 0.3, write: 3.75 },
  tiers: [{ input: 6, output: 22.5, cache: { read: 0.6, write: 7.5 }, tier: { type: 'context', size: 200000 } }],
});
assert.equal(mapped.status, 'active');

// No reasoning signal, no explicit base cost entry, empty cost list.
assert.equal(modelToV1(model()).capabilities.reasoning, false);
assert.equal(modelToV1(model({ variants: [{ id: 'fast', settings: { reasoning: false } }] })).capabilities.reasoning, false);
assert.equal(modelToV1(model({ cost: [], variants: [] })).cost.input, 0);
assert.equal(modelToV1(model({ cost: [{ tier: { type: 'context', size: 1000 }, input: 1, output: 2, cache: { read: 0, write: 0 } }] })).cost.input, 1);
assert.equal(modelToV1(model({ compatibility: { reasoningField: 'reasoning_content' } })).capabilities.reasoning, true);

console.log('v2 mapper tests passed');
