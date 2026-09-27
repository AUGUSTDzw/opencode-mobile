import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// Fixed ports collide with anything else bound on the CI runner. Ask the OS for
// an ephemeral port instead so self-spawned fake servers never hit EADDRINUSE.
async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function resetScenario(request, scenario) {
  const response = await request.post('http://127.0.0.1:44096/__control/reset', {
    data: { scenario },
  });

  expect(response.ok()).toBeTruthy();
}

async function openReadyChat(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Start a new task')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder('Ask anything...')).toBeVisible();
}

function spawnV2Server(port, scenario = 'happy-path') {
  return spawn(process.execPath, ['tests/fake-opencode/server-v2.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FAKE_OPENCODE_PORT: String(port),
      FAKE_OPENCODE_SCENARIO: scenario,
    },
    stdio: 'inherit',
  });
}

// A second V1 server with its own state, used by the multi-connection tests.
function spawnV1Server(port, scenario = 'happy-path') {
  return spawn(process.execPath, ['tests/fake-opencode/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FAKE_OPENCODE_PORT: String(port),
      FAKE_OPENCODE_SCENARIO: scenario,
    },
    stdio: 'inherit',
  });
}

// The settings screen re-renders its Connection subtree after a tab switch, so
// a click can fail on a moving target. Prefer Playwright's normal actionability
// checks, which wait for stability and verify the hit target (a forced click
// can land on the neighbouring accordion header instead); fall back to a forced
// click only when the target never settles. Callers always verify the effect
// of the tap rather than assuming it landed.
async function clickWithRetry(locator) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await locator.click({ timeout: 2500 }).then(() => true).catch(() => false)) {
      return true;
    }
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await locator.click({ timeout: 2500, force: true }).then(() => true).catch(() => false)) {
      return true;
    }
  }
  return false;
}

// The Connection card can be collapsed; reopen it only when its content is not
// visible so repeated visits to Settings do not toggle it shut. Each tap is
// verified, because the settings screen can re-render while the tab settles.
async function ensureConnectionSection(page) {
  const connectionHeader = page.getByRole('button', { name: /^Connection/ });
  const addButton = page.getByTestId('connection-add-button');
  // Wait for the screen itself; tapping a header before it mounts is what lets
  // a click land on the neighbouring accordion.
  await connectionHeader.waitFor({ state: 'visible', timeout: 15_000 });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await addButton.isVisible().catch(() => false)) {
      return;
    }
    await clickWithRetry(connectionHeader);
    if (await addButton.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) {
      return;
    }
  }
  await expect(addButton).toBeVisible({ timeout: 10_000 });
}

// The active connection is always a row, titled "Current connection" while it
// has not been saved as a profile. Expand it to reach Edit and Reconnect.
async function openCurrentConnectionRow(page) {
  await ensureConnectionSection(page);
  const edit = page.getByTestId('connection-edit-current');
  const row = page.getByTestId('connection-row-current');
  await row.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
  if ((await row.count()) === 0) {
    await expect(edit).toBeVisible({ timeout: 10_000 });
    return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await edit.isVisible().catch(() => false)) {
      return;
    }
    await clickWithRetry(row);
    if (await edit.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) {
      return;
    }
  }
  await expect(edit).toBeVisible({ timeout: 10_000 });
}

// Opens the add/edit connection dialog and verifies it actually opened; the
// Connection subtree can still be animating when the trigger is tapped.
async function openConnectionDialog(page, trigger, openedLocator) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await clickWithRetry(trigger);
    if (await openedLocator.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
      return;
    }
  }
  await expect(openedLocator).toBeVisible({ timeout: 10_000 });
}

// Editing the active connection applies to the live settings but deliberately
// waits for Reconnect, so these are two explicit steps.
async function setActiveServerUrl(page, url) {
  await openCurrentConnectionRow(page);
  await openConnectionDialog(page, page.getByTestId('connection-edit-current'), page.getByTestId('connection-profile-url-input'));
  await page.getByTestId('connection-profile-url-input').fill(url);
  await clickWithRetry(page.getByTestId('connection-profile-save-confirm'));
  await expect(page.getByTestId('connection-profile-url-input')).not.toBeVisible({ timeout: 10_000 });
}

async function reconnectActiveConnection(page) {
  await openCurrentConnectionRow(page);
  await clickWithRetry(page.getByTestId('connection-reconnect'));
}

// The status card only renders inside the expanded Connection card, and the
// card can re-render while a tab becomes visible, so keep re-opening it until
// the message names the expected server.
async function expectConnectedTo(page, host) {
  const message = page.getByText(new RegExp(`Connected to http://127\\.0\\.0\\.1:${host}`));
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    await ensureConnectionSection(page);
    if ((await message.count()) > 0) {
      await expect(message.first()).toBeVisible();
      return;
    }
    await page.waitForTimeout(250);
  }

  await expect(message.first()).toBeVisible();
}

async function connectToServer(page, url) {
  await page.getByRole('tab', { name: 'Settings' }).click();
  await ensureConnectionSection(page);
  await setActiveServerUrl(page, url);
  await reconnectActiveConnection(page);
  await expect(page.getByTestId('connection-status-label')).toHaveText('Connected', { timeout: 15_000 });
  await page.getByRole('tab', { name: 'Chat' }).click();
  await expect(page.getByPlaceholder('Ask anything...')).toBeVisible({ timeout: 15_000 });
}

// "Add connection" saves and connects in one step.
async function addConnection(page, { name, url }) {
  await ensureConnectionSection(page);
  await openConnectionDialog(page, page.getByTestId('connection-add-button'), page.getByTestId('connection-profile-name-input'));
  await page.getByTestId('connection-profile-name-input').fill(name);
  await page.getByTestId('connection-profile-url-input').fill(url);
  await clickWithRetry(page.getByTestId('connection-profile-save-confirm'));
  await expect(page.getByTestId('connection-profile-url-input')).not.toBeVisible({ timeout: 10_000 });
}

// Only one row is expanded at a time, so the visible Connect action belongs to
// the row the test just expanded.
async function connectToSavedConnection(page, name) {
  await ensureConnectionSection(page);
  const connect = page.getByRole('button', { name: 'Connect', exact: true });
  const header = page.locator('[data-testid^="connection-row-"]').filter({ hasText: name }).first();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await connect.isVisible().catch(() => false)) {
      break;
    }
    await clickWithRetry(header);
    if (await connect.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) {
      break;
    }
  }

  await expect(connect).toBeVisible({ timeout: 10_000 });
  await clickWithRetry(connect);
}

// The Connection card starts expanded, so reach the AI defaults card
// explicitly before configuring providers.
async function ensureAiSection(page) {
  const aiHeader = page.getByRole('button', { name: /^AI & providers/ });
  const addProvider = page.getByTestId('settings-add-provider-button');
  await aiHeader.waitFor({ state: 'visible', timeout: 15_000 });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await addProvider.isVisible().catch(() => false)) {
      return;
    }
    await clickWithRetry(aiHeader);
    if (await addProvider.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) {
      return;
    }
  }
  await expect(addProvider).toBeVisible({ timeout: 10_000 });
}

async function sendPrompt(page, prompt) {
  await page.getByPlaceholder('Ask anything...').fill(prompt);
  await page.getByTestId('chat-primary-button').click();
}

async function waitForServer(request, url, timeoutMs = 10_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await request.get(url);
      if (response.ok()) {
        return;
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await sleep(200);
  }

  throw new Error(`Timed out waiting for fake server at ${url}`);
}

test('happy path keeps the main chat flow stable', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, 'Stabilize the chat flow against the fake server');

  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Flow stayed stable against the fake OpenCode server/).first()).toBeVisible();
  await page.getByText('1 Files Changed', { exact: true }).click();
  await expect(page.getByText('1 files changed, +6 / -1', { exact: true })).toBeVisible();
  await page.getByText('app/(tabs)/index.tsx', { exact: true }).click();
  await expect(page.getByText(/export default function ChatLandingScreen/)).toBeVisible();
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await expect(page.getByRole('button', { name: 'Chats', exact: true })).toBeVisible();
  await expect(page.getByText('Stabilize the chat flow', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('idle', { exact: true }).first()).toBeVisible();
  await page.getByText('Files', { exact: true }).click();
  await expect(page.getByText('2 changed files', { exact: true })).toBeVisible();
});

test('files changed follows the latest user turn', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, 'Create the first file diff');
  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText('1 Files Changed', { exact: true }).click();
  await expect(page.getByText('app/(tabs)/index.tsx', { exact: true })).toBeVisible();

  await page.getByText('Session', { exact: true }).click();
  await sendPrompt(page, 'Create the second file diff');
  await expect(page.getByText(/Finished: Create the second file diff/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText('1 Files Changed', { exact: true }).click();
  await expect(page.getByText('src/feature.ts', { exact: true })).toBeVisible();
  await expect(page.getByText('app/(tabs)/index.tsx', { exact: true })).not.toBeVisible();
});

test('files changed switches between turn, uncommitted, and branch diffs', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, 'Create a turn diff for scope switching');
  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText('1 Files Changed', { exact: true }).click();
  await expect(page.getByText('Latest turn diff', { exact: true })).toBeVisible();
  await expect(page.getByText('app/(tabs)/index.tsx', { exact: true })).toBeVisible();

  // No working-tree edits were saved in this scenario.
  await page.getByText('Uncommitted', { exact: true }).click();
  await expect(page.getByText('No uncommitted changes.', { exact: true })).toBeVisible();

  // Committed-on-branch fixture from the fake server.
  await page.getByText('Branch', { exact: true }).click();
  await expect(page.getByText('Changes vs default branch', { exact: true })).toBeVisible();
  await expect(page.getByText('README.md', { exact: true })).toBeVisible();

  await page.getByText('Turn', { exact: true }).click();
  await expect(page.getByText('app/(tabs)/index.tsx', { exact: true })).toBeVisible();
});

test('permission requests unblock the agent flow', async ({ page, request }) => {
  await resetScenario(request, 'permission');
  await openReadyChat(page);

  await sendPrompt(page, 'Trigger a permission request');

  await expect(page.getByText('Permission request', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByText('Allow once').click();
  await expect(page.getByText(/permission resolved/).first()).toBeVisible({ timeout: 20_000 });
});

test('assistant questions unblock the agent flow', async ({ page, request }) => {
  await resetScenario(request, 'question');
  await openReadyChat(page);

  await sendPrompt(page, 'Ask an implementation question');

  await expect(page.getByText('Which implementation should be used?', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByText('Minimal', { exact: true }).click();
  await page.getByText('Submit answer', { exact: true }).click();
  await expect(page.getByText(/selected Minimal/).first()).toBeVisible({ timeout: 20_000 });
});

test('sessions can be renamed and require confirmation before deletion', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, 'Create a session to rename');
  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel(/Actions for/).first().click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByTestId('workspace-session-title-input').fill('Renamed from Playwright');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('Renamed from Playwright', { exact: true }).first()).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Workspace' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByLabel('Actions for Renamed from Playwright').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByText('Renamed from Playwright', { exact: true }).nth(1)).not.toBeVisible();
});

test('commands execute through the primary chat action', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, '/review src');
  await expect(page.getByText('Command /review src completed.', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
});

test('workspace file search opens deterministic file content', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByText('Files', { exact: true }).click();
  await page.getByTestId('workspace-file-search').fill('demo');
  await page.getByText('Search', { exact: true }).click();
  await expect(page.getByText('src/demo.ts', { exact: true })).toBeVisible();
  await page.getByText('src/demo.ts', { exact: true }).click();
  await expect(page.getByText(/OpenCode 1\.18\.3/)).toBeVisible();
});

test('workspace files save through a conflict-checked VCS patch', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByText('Files', { exact: true }).click();
  await page.getByTestId('workspace-file-search').fill('demo');
  await page.getByText('Search', { exact: true }).click();
  await page.getByText('src/demo.ts', { exact: true }).click();
  await page.getByText('Edit', { exact: true }).click();
  await page.getByTestId('workspace-file-editor').fill('export const demo = "OpenCode SDK 1.18.3";\n');
  await page.getByTestId('workspace-file-save-button').click();
  await expect(page.getByText(/OpenCode SDK 1\.18\.3/)).toBeVisible();
});

test('sessions archive and restore without deletion', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);
  await sendPrompt(page, 'Archive this session safely');
  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel(/Actions for/).first().click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await page.getByLabel('Show archived chats').click();
  await expect(page.getByText('Archive this session safely', { exact: true }).last()).toBeVisible();
  await page.getByLabel(/Restore Archive this session safely/).click();
  await expect(page.getByText('No archived chats.', { exact: true })).toBeVisible();
});

test('worktrees and MCP servers can be created', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByText('Tools', { exact: true }).click();
  await page.getByTestId('workspace-worktree-name').fill('mobile-test');
  await page.getByTestId('workspace-worktree-create').click();
  await expect(page.getByText('mobile-test', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByText('Remote', { exact: true }).click();
  await page.getByTestId('settings-mcp-name').fill('web-tools');
  await page.getByTestId('settings-mcp-target').fill('https://example.test/mcp');
  await page.getByTestId('settings-mcp-add').click();
  await expect(page.getByText('web-tools', { exact: true })).toBeVisible();
});

test('terminal streams input and output over the PTY websocket', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);
  await page.getByRole('tab', { name: 'Terminal' }).click();
  await page.getByTestId('terminal-create-button').click();
  await page.getByTestId('terminal-line-input').fill('echo web');
  await page.getByRole('button', { name: 'Send command' }).click();
  await expect(page.getByTestId('terminal-output')).toContainText('ran: echo web');
});

test('settings can configure an additional provider against the fake server', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await ensureAiSection(page);
  await expect(page.getByText('AI defaults')).toBeVisible();
  await page.getByTestId('settings-add-provider-button').click();
  await expect(page.getByRole('button', { name: 'OpenRouter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await expect(page.getByText('Configure OpenRouter')).toBeVisible();
  await page.getByPlaceholder('Paste your API key').fill('sk-test-openrouter');
  await page.getByTestId('settings-provider-save-button').click();
  await expect(page.getByText('Configure OpenRouter')).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'OpenRouter', exact: true })).toBeVisible();
});

test('chat model picker searches and groups models by provider', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await ensureAiSection(page);
  await page.getByTestId('settings-add-provider-button').click();
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await page.getByPlaceholder('Paste your API key').fill('sk-test-openrouter');
  await page.getByTestId('settings-provider-save-button').click();
  await expect(page.getByText('Configure OpenRouter')).not.toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'OpenRouter 0 of 1 selected' }).click();
  await page.getByText('Auto', { exact: true }).click();

  await page.getByRole('tab', { name: 'Chat' }).click();
  await page.getByTestId('chat-model-picker-trigger').click();
  const modelPicker = page.getByTestId('chat-model-picker');
  await expect(modelPicker.getByText('OpenAI', { exact: true })).toBeVisible();
  await expect(modelPicker.getByText('OpenRouter', { exact: true })).toBeVisible();
  await expect(modelPicker.getByText('Selected', { exact: true })).toBeVisible();
  await page.getByTestId('chat-model-picker-search').fill('openrouter');
  await expect(modelPicker.getByText('OpenAI', { exact: true })).not.toBeVisible();
  await expect(modelPicker.getByText('Selected', { exact: true })).not.toBeVisible();
  await modelPicker.getByRole('button', { name: /^Auto / }).click();
  await expect(page.getByTestId('chat-model-picker-trigger')).toContainText('OpenRouter · Auto');

  await page.getByTestId('chat-model-picker-trigger').click();
  await expect(page.getByTestId('chat-model-picker-search')).toHaveValue('');
  await modelPicker.getByRole('button', { name: /^GPT-4\.1 mini / }).click();
  await expect(page.getByTestId('chat-model-picker-trigger')).toContainText('OpenAI · GPT-4.1 mini');

  await page.getByTestId('chat-model-picker-trigger').click();
  await expect(modelPicker.getByText('Selected', { exact: true })).toBeVisible();
  await expect(modelPicker.getByText('Recent', { exact: true })).toBeVisible();
  await expect(modelPicker.getByText('OpenRouter · openrouter/auto', { exact: false })).toBeVisible();
  await page.getByTestId('chat-model-picker-search').fill('not-a-model');
  await expect(modelPicker.getByText('Recent', { exact: true })).not.toBeVisible();
  await expect(page.getByText('No matching models', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chat-model-picker-search')).toHaveValue('not-a-model');
  await page.getByLabel('Close model picker').click();
});

test('polling fallback still finishes the flow when SSE is unavailable', async ({ page, request }) => {
  await resetScenario(request, 'stream-disconnect');
  await openReadyChat(page);

  await sendPrompt(page, 'Finish through polling fallback');

  await expect(page.getByText(/Finished: Finish through polling fallback/).first()).toBeVisible({ timeout: 40_000 });
  await page.getByText('1 Files Changed', { exact: true }).click();
  await expect(page.getByText('app/(tabs)/index.tsx', { exact: true })).toBeVisible({ timeout: 40_000 });
});

test('deep links switch projects and open a specific session', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  const fakeServer = 'http://127.0.0.1:44096';
  const projectPath = '/workspace/secondary-project';

  const createResponse = await request.post(`${fakeServer}/session?directory=${encodeURIComponent(projectPath)}`, {
    data: { title: 'Deep Link Target Session' },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = await createResponse.json();
  const sessionId = created.id;
  expect(sessionId).toBe('session-1');

  await request.post(`${fakeServer}/session/${sessionId}/prompt_async`, {
    data: { parts: [{ type: 'text', text: 'Open me through a deep link' }] },
  });
  await sleep(1500);
  await openReadyChat(page);

  await page.goto(`/session/${sessionId}?project=${encodeURIComponent(projectPath)}`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(
    page.locator('text="Deep Link Target Session" >> visible=true').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('text="Open me through a deep link" >> visible=true').first(),
  ).toBeVisible();
  await expect(
    page.locator('text=/Finished: Open me through a deep link/ >> visible=true').first(),
  ).toBeVisible({ timeout: 20_000 });
});

test('deep links report sessions that are missing', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  const fakeServer = 'http://127.0.0.1:44096';

  await request.post(`${fakeServer}/session`, {
    data: { title: 'Existing Session' },
  });

  await page.goto(`/session/session-999?project=${encodeURIComponent('/workspace/demo-project')}`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByText('Could not open session', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/was not found/).first()).toBeVisible();
});

test('settings explain root-vs-api mismatches and reconnect through a prefixed API base URL', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  const port = await getFreePort();
  const server = spawn(process.execPath, ['tests/fake-opencode/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FAKE_OPENCODE_PORT: String(port),
      FAKE_OPENCODE_SCENARIO: 'happy-path',
      FAKE_OPENCODE_BASE_PATH: '/api',
    },
    stdio: 'inherit',
  });

  try {
    await waitForServer(request, `http://127.0.0.1:${port}/api/path`);
    await openReadyChat(page);

    await page.getByRole('tab', { name: 'Settings' }).click();
    await ensureConnectionSection(page);

    await setActiveServerUrl(page, `http://127.0.0.1:${port}`);
    await reconnectActiveConnection(page);
    await expect(page.getByText(new RegExp(`OpenCode endpoint not found at http://127.0.0.1:${port}`)).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(new RegExp(`http://127.0.0.1:${port}/api`)).first()).toBeVisible();

    await setActiveServerUrl(page, `http://127.0.0.1:${port}/api`);
    await reconnectActiveConnection(page);
    await expect(page.getByTestId('connection-status-label')).toHaveText('Connected', { timeout: 15_000 });
    await ensureConnectionSection(page);
    await expect(page.getByText(new RegExp(`Connected to http://127.0.0.1:${port}/api`))).toBeVisible();
  } finally {
    server.kill('SIGTERM');
  }
});

test('settings do not suggest a duplicated /api base when the API prefix is already set', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await ensureConnectionSection(page);

  await setActiveServerUrl(page, 'http://127.0.0.1:44096/api');
  await reconnectActiveConnection(page);
  await expect(page.getByText(/OpenCode endpoint not found at http:\/\/127\.0\.0\.1:44096\/api\b/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/OpenCode 1\.x and 2\.x servers/).first()).toBeVisible();
  await expect(page.getByText(/http:\/\/127\.0\.0\.1:44096\/api\/api/)).toHaveCount(0);
});

test('a 1.x server exposing /api compatibility routes still connects as 1.x', async ({ page, request }) => {
  const port = await getFreePort();
  const server = spawn(process.execPath, ['tests/fake-opencode/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FAKE_OPENCODE_PORT: String(port),
      FAKE_OPENCODE_SCENARIO: 'happy-path',
      FAKE_OPENCODE_V2_COMPAT: '1',
    },
    stdio: 'inherit',
  });

  try {
    await waitForServer(request, `http://127.0.0.1:${port}/global/health`);
    await openReadyChat(page);
    await connectToServer(page, `http://127.0.0.1:${port}`);
    await sendPrompt(page, 'Confirm 1.x stays on 1.x');
    await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('tab', { name: 'Settings' }).click();
    await ensureConnectionSection(page);
    await expect(page.getByText(new RegExp(`Connected to http://127\\.0\\.0\\.1:${port} \\(OpenCode 1\\.x\\)`))).toBeVisible({ timeout: 15_000 });
  } finally {
    server.kill('SIGTERM');
  }
});

test('connects to an OpenCode 2 server and completes a prompt', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  const port = await getFreePort();
  const server = spawnV2Server(port);

  try {
    await waitForServer(request, `http://127.0.0.1:${port}/api/info`);
    await openReadyChat(page);
    await connectToServer(page, `http://127.0.0.1:${port}`);
    await sendPrompt(page, 'Verify the OpenCode 2 adapter');
    await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Flow stayed stable against the fake OpenCode server/).first()).toBeVisible();

    // Context utilization must carry session.model/tokens through the V2
    // adapter and measure the latest model call instead of "Unavailable".
    // Fake V2 usage: 1200 in + 800 cache read + 100 cache write + 240 out.
    await page.getByLabel('Show session usage details').click();
    await expect(page.getByText('Context utilization', { exact: true })).toBeVisible();
    await expect(page.getByLabel('2 percent context utilization')).toBeVisible();
    await expect(page.getByText('2.3K of 128K input tokens', { exact: true })).toBeVisible();
    await expect(page.getByText('OpenCode did not provide a context limit for this model.')).toHaveCount(0);
    await page.getByText('Close', { exact: true }).click();

    // V2 prompts have no `system` field, so chat preferences must land in a
    // session instruction entry instead of being dropped.
    const instructions = await (await request.get(`http://127.0.0.1:${port}/__control/instructions`)).json();
    const preferenceValues = Object.values(instructions.data).flatMap((entries) => Object.values(entries));
    expect(preferenceValues.some((value) => typeof value === 'string' && value.includes('Keep responses tightly scoped'))).toBe(true);

    // V2 has no server-owned todo endpoint; the plan is derived from the
    // transcript's `todowrite` tool part.
    await expect(page.getByText('Plan', { exact: true })).toBeVisible();
    await expect(page.getByText('2 of 2 tasks completed')).toBeVisible();

    // Unsupported V2 actions are hidden rather than failing at tap time.
    await expect(page.getByText('Ask permission', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Workspace' }).click();
    await expect(page.getByLabel('Show archived chats')).toHaveCount(0);
    await page.getByLabel(/Actions for/).first().click();
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Share' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Archive' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Advanced/ }).click();
    await expect(page.getByText(/LSP/)).toHaveCount(0);
    await expect(page.getByText(/Formatters/)).toHaveCount(0);
  } finally {
    server.kill('SIGTERM');
  }
});

test('OpenCode 2 permission requests unblock the agent flow', async ({ page, request }) => {
  const port = await getFreePort();
  const server = spawnV2Server(port, 'permission');
  try {
    await resetScenario(request, 'happy-path');
    await waitForServer(request, `http://127.0.0.1:${port}/api/info`);
    await openReadyChat(page);
    await connectToServer(page, `http://127.0.0.1:${port}`);
    await sendPrompt(page, 'Trigger a permission request');
    await expect(page.getByText('Permission request', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText('Allow once').click();
    await expect(page.getByText(/permission resolved/).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    server.kill('SIGTERM');
  }
});

test('OpenCode 2 questions unblock the agent flow', async ({ page, request }) => {
  const port = await getFreePort();
  const server = spawnV2Server(port, 'question');
  try {
    await resetScenario(request, 'happy-path');
    await waitForServer(request, `http://127.0.0.1:${port}/api/info`);
    await openReadyChat(page);
    await connectToServer(page, `http://127.0.0.1:${port}`);
    await sendPrompt(page, 'Ask an implementation question');
    await expect(page.getByText('Which implementation should be used?', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText('Minimal', { exact: true }).click();
    await page.getByText('Submit answer', { exact: true }).click();
    await expect(page.getByText(/question resolved/).first()).toBeVisible({ timeout: 20_000 });
    // The submitted label is translated back to the form option's value, not the label.
    await expect(page.getByText(/"q0":"minimal"/).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    server.kill('SIGTERM');
  }
});

test('OpenCode 2 terminal streams input and output over the PTY websocket', async ({ page, request }) => {
  const port = await getFreePort();
  const server = spawnV2Server(port);
  try {
    await resetScenario(request, 'happy-path');
    await waitForServer(request, `http://127.0.0.1:${port}/api/info`);
    await openReadyChat(page);
    await connectToServer(page, `http://127.0.0.1:${port}`);
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await page.getByTestId('terminal-create-button').click();
    await page.getByTestId('terminal-line-input').fill('echo v2');
    await page.getByRole('button', { name: 'Send command' }).click();
    await expect(page.getByTestId('terminal-output')).toContainText('ran: echo v2');
  } finally {
    server.kill('SIGTERM');
  }
});

test('OpenCode 2 files changed reads location-scoped VCS diffs', async ({ page, request }) => {
  const port = await getFreePort();
  const server = spawnV2Server(port);
  try {
    await resetScenario(request, 'happy-path');
    await waitForServer(request, `http://127.0.0.1:${port}/api/info`);
    await openReadyChat(page);
    await connectToServer(page, `http://127.0.0.1:${port}`);
    await sendPrompt(page, 'Check the OpenCode 2 file changes');
    await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('tab', { name: /Files Changed/ }).click();
    await expect(page.getByText('Latest turn diff', { exact: true })).toBeVisible();

    // V2 answers unscoped VCS calls for the server's own directory, so the
    // request must carry location[directory] for the workspace diff to show.
    const scopedVcsDiff = page.waitForRequest((candidate) => {
      const url = decodeURIComponent(candidate.url());
      return url.includes('/api/vcs/diff') && url.includes('location[directory]');
    });
    await page.getByText('Uncommitted', { exact: true }).click();
    await scopedVcsDiff;
    await expect(page.getByText('No uncommitted changes.', { exact: true })).toBeVisible();

    // Committed-on-branch fixture: only reachable through a scoped call.
    await page.getByText('Branch', { exact: true }).click();
    await expect(page.getByText('Changes vs default branch', { exact: true })).toBeVisible();
    await expect(page.getByText('README.md', { exact: true })).toBeVisible();
  } finally {
    server.kill('SIGTERM');
  }
});

test('favorites open sessions in the current workspace', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, 'Favorite current workspace session');
  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel('Actions for Favorite current workspace session').click();
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click();

  const favoritesBar = page.getByTestId('workspace-favorites-bar');
  await expect(favoritesBar).toBeVisible();
  await expect(favoritesBar.getByText('Favorite current workspace session')).toBeVisible();

  await page.getByLabel('New chat').click();
  await expect(page.getByText('Start a new task')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel('Open favorite Favorite current workspace session').click();

  await expect(
    page.locator('text=/Finished: Favorite current workspace session/ >> visible=true').first(),
  ).toBeVisible({ timeout: 20_000 });
});

test('favorites switch projects and open cross-workspace sessions', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  const fakeServer = 'http://127.0.0.1:44096';
  const projectPath = '/workspace/secondary-project';

  const createResponse = await request.post(`${fakeServer}/session?directory=${encodeURIComponent(projectPath)}`, {
    data: { title: 'Favorite Cross Workspace Session' },
  });
  expect(createResponse.ok()).toBeTruthy();
  const { id: sessionId } = await createResponse.json();

  await request.post(`${fakeServer}/session/${sessionId}/prompt_async`, {
    data: { parts: [{ type: 'text', text: 'Open me through a favorite' }] },
  });
  await sleep(1500);
  await openReadyChat(page);

  await page.goto(`/session/${sessionId}?project=${encodeURIComponent(projectPath)}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.locator('text=/Finished: Open me through a favorite/ >> visible=true').first(),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel('Actions for Favorite Cross Workspace Session').click();
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click();
  await expect(page.getByTestId('workspace-favorites-bar')).toBeVisible();

  await page.getByText('secondary-project', { exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'demo-project' }).click();

  const favoritesBar = page.getByTestId('workspace-favorites-bar');
  await expect(favoritesBar).toBeVisible();
  await expect(favoritesBar.getByText('secondary-project')).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Open favorite Favorite Cross Workspace Session').click();

  await expect(
    page.locator('text=/Finished: Open me through a favorite/ >> visible=true').first(),
  ).toBeVisible({ timeout: 20_000 });
});

test('favorites report sessions that are missing', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  await sendPrompt(page, 'Favorite vanishing session');
  await expect(page.getByText(/Finished:/).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel('Actions for Favorite vanishing session').click();
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click();
  await expect(page.getByTestId('workspace-favorites-bar')).toBeVisible();

  const deleteResponse = await request.delete('http://127.0.0.1:44096/session/session-1');
  expect(deleteResponse.ok()).toBeTruthy();

  await page.getByLabel('Open favorite Favorite vanishing session').click();
  await expect(
    page.getByText(/could not open|not found|failed/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('rapid favorite taps across workspaces settle on the last target', async ({ page, request }) => {
  await resetScenario(request, 'happy-path');
  const fakeServer = 'http://127.0.0.1:44096';
  const projectPath = '/workspace/secondary-project';

  const createResponse = await request.post(`${fakeServer}/session?directory=${encodeURIComponent(projectPath)}`, {
    data: { title: 'Rapid Tap Secondary' },
  });
  expect(createResponse.ok()).toBeTruthy();
  const { id: secondarySessionId } = await createResponse.json();

  await request.post(`${fakeServer}/session/${secondarySessionId}/prompt_async`, {
    data: { parts: [{ type: 'text', text: 'Secondary rapid tap target' }] },
  });
  await sleep(1500);
  await openReadyChat(page);
  await sendPrompt(page, 'Primary rapid tap target');
  await expect(page.getByText(/Finished: Primary rapid tap target/).first()).toBeVisible({ timeout: 20_000 });

  await page.goto(`/session/${secondarySessionId}?project=${encodeURIComponent(projectPath)}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.locator('text=/Finished: Secondary rapid tap target/ >> visible=true').first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await page.getByLabel('Actions for Rapid Tap Secondary').click();
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click();

  await page.getByText('secondary-project', { exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'demo-project' }).click();
  await page.getByLabel('Actions for Primary rapid tap target').click();
  await page.getByRole('menuitem', { name: 'Add to favorites' }).click();
  await expect(page.getByTestId('workspace-favorites-bar')).toBeVisible();

  // Dispatch both presses back to back so the second lands before the first
  // navigation moves the app off the workspace tab.
  await page.getByLabel('Open favorite Rapid Tap Secondary').dispatchEvent('click');
  await page.getByLabel('Open favorite Primary rapid tap target').dispatchEvent('click');

  await expect(
    page.locator('text=/Finished: Primary rapid tap target/ >> visible=true').first(),
  ).toBeVisible({ timeout: 20_000 });
});

test('saved connections keep sessions, caches, and model preferences separate', async ({ page, request }) => {
  // Two servers, two prompts, and two profile switches need more headroom than
  // a single-flow test.
  test.setTimeout(90_000);
  await resetScenario(request, 'happy-path');
  await openReadyChat(page);

  // Connection A is the default happy-path server. Give it a session, then
  // save it as a named connection and give it a non-default model preference.
  await connectToServer(page, 'http://127.0.0.1:44096');
  await sendPrompt(page, 'Server A session');
  await expect(page.getByText(/Finished: Server A session/).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Settings' }).click();
  await addConnection(page, { name: 'Server A', url: 'http://127.0.0.1:44096' });
  await expectConnectedTo(page, '44096');

  await ensureAiSection(page);
  await page.getByTestId('settings-add-provider-button').click();
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await page.getByPlaceholder('Paste your API key').fill('sk-test-openrouter');
  await page.getByTestId('settings-provider-save-button').click();
  await expect(page.getByText('Configure OpenRouter')).not.toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'OpenRouter 0 of 1 selected' }).click();
  await page.getByText('Auto', { exact: true }).click();
  await page.getByRole('tab', { name: 'Chat' }).click();
  await page.getByTestId('chat-model-picker-trigger').click();
  await page.getByTestId('chat-model-picker').getByRole('button', { name: /^Auto / }).click();
  await expect(page.getByTestId('chat-model-picker-trigger')).toContainText('OpenRouter · Auto');

  // Connection B is a separate process with separate server state but the same
  // project paths, which is the cache-isolation case.
  const port = await getFreePort();
  const serverB = spawnV1Server(port);
  try {
    await waitForServer(request, `http://127.0.0.1:${port}/path`);
    await page.getByRole('tab', { name: 'Settings' }).click();
    await addConnection(page, { name: 'Server B', url: `http://127.0.0.1:${port}` });
    await expectConnectedTo(page, String(port));

    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByTestId('chat-model-picker-trigger')).toContainText('OpenAI · GPT-4.1 mini', { timeout: 15_000 });
    await sendPrompt(page, 'Server B session');
    await expect(page.getByText(/Finished: Server B session/).first()).toBeVisible({ timeout: 20_000 });

    // Switching to A restores A's model preference and A's own session list;
    // B's session must never appear while connected to A.
    await page.getByRole('tab', { name: 'Settings' }).click();
    await connectToSavedConnection(page, 'Server A');
    await expectConnectedTo(page, '44096');
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByTestId('chat-model-picker-trigger')).toContainText('OpenRouter · Auto', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Workspace' }).click();
    await expect(page.getByText('Server A session', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Server B session', { exact: true })).not.toBeVisible();

    // Switching back to B restores B's default model and B's own sessions.
    await page.getByRole('tab', { name: 'Settings' }).click();
    await connectToSavedConnection(page, 'Server B');
    await expectConnectedTo(page, String(port));
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByTestId('chat-model-picker-trigger')).toContainText('OpenAI · GPT-4.1 mini', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Workspace' }).click();
    await expect(page.getByText('Server B session', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Server A session', { exact: true })).not.toBeVisible();
  } finally {
    serverB.kill('SIGTERM');
  }
});
