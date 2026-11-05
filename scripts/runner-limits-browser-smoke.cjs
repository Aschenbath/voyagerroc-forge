const { chromium, expect } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const origin = process.env.FORGE_URL || 'http://127.0.0.1:4317';
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const state = await (await page.request.get(origin + '/api/state')).json();
    const project = state.projects.find(p => p.full_name === 'local/runner-demo');
    assert.ok(project, 'Start npm run demo:runner first');
    const post = async (path, data) => {
      const response = await page.request.post(origin + path, {
        headers: { Origin: origin, 'X-Forge-Client': 'local-ui' }, data
      });
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    const title = 'Review scoped edit limits';
    let task = state.tasks.find(t => t.title === title && t.project_id === project.id);
    task ??= await post('/api/tasks', { projectId: project.id, title, adapter: 'github',
      intent: 'Check the runner limits before correcting the demo greeting.' });
    for (const [status, action] of [['queued', 'plan'], ['planned', 'review'], ['in_review', 'approve']]) {
      if (task.status === status) task = await post(`/api/tasks/${task.id}/${action}`, { version: task.version });
    }

    const dialog = page.getByRole('dialog', { name: 'Run scoped edits', exact: true });
    const start = page.locator('.task-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Run scoped edits', exact: true });
    const banner = page.locator('#runner-limits');
    const edits = page.getByLabel('File edits (JSON array)');
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    const submit = dialog.getByRole('button', { name: 'Run edits & static checks', exact: true });
    const assertFits = async () => {
      assert.deepEqual(await dialog.evaluate(el => ({
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        dialogOverflow: el.scrollWidth > el.clientWidth,
        outsideViewport: el.getBoundingClientRect().left < 0 || el.getBoundingClientRect().right > innerWidth
      })), { pageOverflow: false, dialogOverflow: false, outsideViewport: false });
    };
    fs.mkdirSync('qa', { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(origin);
      await start.focus(); await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await expect(banner).toContainText('Snapshot: 1–200 tracked files, up to 1 MiB per file and 10 MiB total.');
      await expect(banner).toContainText('Edits: 1–20 file edits, up to 256 KiB of UTF-8 text across all before and after strings combined.');
      await expect(banner).toContainText(`Run timeout: ${state.runner.timeoutMs / 1000}s.`);
      await expect(edits).toHaveAccessibleDescription(/Snapshot:.*Edits:.*No AI generation or project tests\./);
      await expect(close).toBeFocused();
      await page.keyboard.press('Tab'); await expect(edits).toBeFocused();
      await page.keyboard.press('Tab'); await expect(submit).toBeFocused();
      await expect(submit).toBeInViewport();
      await page.keyboard.press('Shift+Tab'); await expect(edits).toBeFocused();
      await page.keyboard.press('Shift+Tab'); await expect(close).toBeFocused();
      await assertFits();
      await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
      await expect(start).toBeFocused();
      await page.keyboard.press('Enter'); await expect(close).toBeFocused();
      await page.keyboard.press('Enter'); await expect(dialog).not.toBeVisible();
      await expect(start).toBeFocused();
      await page.keyboard.press('Enter');
      await edits.fill(JSON.stringify([{ path: 'hello.mjs', before: '"helo"', after: '"hello"' }], null, 2));
      await close.focus();
      await dialog.screenshot({ path: `qa/scoped-edit-limits-${width}.png` });
      await page.keyboard.press('Escape');
    }
    // A changed API payload must change every displayed limit, with no fallback constants.
    await page.route('**/api/state', async route => {
      const response = await route.fetch(); const body = await response.json();
      body.runner.limits = {
        snapshot: { minFiles: 2, maxFiles: 9, maxFileBytes: 524288, maxTotalBytes: 2097152 },
        edits: { minCount: 2, maxCount: 3, maxTextBytes: 4096 }
      };
      body.runner.timeoutMs = 1200;
      await route.fulfill({ response, json: body });
    });
    await page.reload(); await start.focus(); await page.keyboard.press('Enter');
    await expect(banner).toContainText('Snapshot: 2–9 tracked files, up to 512 KiB per file and 2 MiB total.');
    await expect(banner).toContainText('Edits: 2–3 file edits, up to 4 KiB of UTF-8 text across all before and after strings combined.');
    await expect(banner).toContainText('Run timeout: 1.2s.');
    await assertFits();
    const after = await (await page.request.get(origin + '/api/state')).json();
    assert.equal(after.runs.length, state.runs.length, 'Viewing limits must not start a run');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ widths: [1440, 390], keyboard: 'passed', overflow: false,
      alternateMetadata: 'passed (mocked API payload)', runsStarted: 0, pageErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
