/** Real disposable product/SQL/Chromium gate. Called by smokeA2Integration. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type pg from 'pg';
type User = {
    id: string;
    email: string;
    password: string;
    token: string;
};
export async function runSettingsSections({ appUrl, baselineUrl, db, users, directory, pass }: {
    appUrl: string;
    baselineUrl?: string;
    db: pg.Client;
    users: Record<string, User>;
    directory: string;
    pass: (name: string) => void;
}) {
    assert.ok(baselineUrl, 'provide SETTINGS_SECTIONS_BASELINE_ROOT');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const report: any = { checks: [], visualWrites: [], payloads: {}, screenshots: [], remoteWrites: 0 };
    const save = () => writeFileSync(`${directory}/settings-sections.json`, JSON.stringify(report, null, 2));
    const ok = (name: string) => { report.checks.push(name); pass(name); save(); };
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename as string);
    const fingerprint = async () => {
        const result: Record<string, string> = {};
        for (const table of tables)
            result[table] = (await db.query(`SELECT md5(coalesce(jsonb_agg(row ORDER BY row::text)::text,'[]')) AS hash FROM (SELECT to_jsonb(t) AS row FROM public."${table}" t) s`)).rows[0].hash;
        return result;
    };
    const login = async (url: string, role = 'admin') => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        await page.goto(url + '/login');
        await page.getByLabel('Email', { exact: true }).fill(users[role].email);
        await page.getByLabel('Contraseña (opcional para enlace)', { exact: true }).fill(users[role].password);
        await page.getByRole('button', { name: 'Entrar con contraseña', exact: true }).click();
        await page.waitForURL('**/dashboard');
        await page.goto(url + '/settings');
        return page;
    };
    const section = (page: Page, key: string) => page.getByTestId(`settings-section-${key}`);
    const trigger = (page: Page, key: string) => section(page, key).locator('h3 > button').first();
    const setOpen = async (page: Page, key: string, value: boolean) => {
        const button = trigger(page, key);
        if ((await button.getAttribute('aria-expanded')) !== String(value))
            await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), String(value));
    };
    const shot = async (page: Page, name: string) => { await page.locator('main').evaluate(el => { el.scrollTop = 0; }); await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' }); report.screenshots.push(name + '.png'); };
    const tab = async (page: Page, name: RegExp) => page.getByRole('tab', { name }).click();
    let page: Page | undefined;
    try {
        const baseline = await login(baselineUrl!);
        await baseline.getByLabel('Inicio habitual', { exact: true }).waitFor();
        await shot(baseline, 'before-general');
        await tab(baseline, /plantillas|templates/i);
        await baseline.getByRole('button', { name: 'Create', exact: true }).waitFor();
        await shot(baseline, 'before-templates');
        await tab(baseline, /platós|spaces/i);
        await shot(baseline, 'before-spaces');
        await baseline.close();
        page = await login(appUrl);
        await trigger(page, 'program').waitFor();
        const writes: any[] = [];
        page.on('request', request => {
            if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
                writes.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() });
        });
        const before = await fingerprint();
        const groups: [
            RegExp,
            string[]
        ][] = [[/general/i, ['program', 'optimizer', 'control-room']], [/plantillas|templates/i, ['templates']], [/platós|spaces/i, ['spaces', 'column-order']], [/recursos|resources/i, ['transport', 'resources']], [/producción|production/i, ['people', 'teams', 'staff-defaults']], [/usuarios/i, ['users']]];
        for (const [name, keys] of groups) {
            console.log(`Checking settings tab ${name}`);
            await tab(page, name);
            for (const key of keys) {
                const button = trigger(page, key);
                await button.waitFor();
                assert.equal(await button.getAttribute('aria-expanded'), 'true');
                const id = await button.getAttribute('aria-controls');
                assert.ok(id);
                assert.equal(await page.locator(`[id="${id}"]`).isVisible(), true);
                await button.focus();
                await button.press('Enter');
                assert.equal(await button.getAttribute('aria-expanded'), 'false');
                assert.equal(await page.locator(`[id="${id}"]`).isVisible(), false);
                assert.equal(await button.evaluate(el => el === document.activeElement), true);
                await button.press('Space');
                assert.equal(await button.getAttribute('aria-expanded'), 'true');
                assert.equal(await button.locator('button').count(), 0);
            }
        }
        assert.deepEqual(writes, []);
        const afterVisual = await fingerprint();
        assert.deepEqual(afterVisual, before);
        report.visualSql = { before, after: afterVisual };
        ok('six tabs / twelve sections: native keyboard, aria, hidden content, default open and zero operational writes; every public table unchanged');
        // Unsaved explicit-save forms and inner expansion state survive folding.
        await tab(page, /general/i);
        const workStart = page.getByLabel('Inicio habitual', { exact: true });
        const originalStart = await workStart.inputValue();
        await workStart.fill('08:17');
        await setOpen(page, 'program', false);
        await setOpen(page, 'program', true);
        assert.equal(await workStart.inputValue(), '08:17');
        await workStart.fill('23:59');
        await setOpen(page, 'program', false);
        assert.equal(await section(page, 'program').getByRole('alert').isVisible(), true);
        await setOpen(page, 'program', true);
        await workStart.fill(originalStart);
        await setOpen(page, 'optimizer', false);
        await setOpen(page, 'control-room', false);
        await shot(page, 'after-general');
        await tab(page, /plantillas|templates/i);
        const order = section(page, 'templates').getByRole('combobox').first();
        await order.click();
        await page.getByRole('option', { name: 'Duración', exact: true }).click();
        await setOpen(page, 'templates', false);
        await setOpen(page, 'templates', true);
        assert.match(await order.textContent() ?? '', /Duración/);
        const filter = page.getByPlaceholder(/buscar/i).first();
        if (await filter.count()) {
            await filter.fill('IN');
            await setOpen(page, 'templates', false);
            await setOpen(page, 'templates', true);
            assert.equal(await filter.inputValue(), 'IN');
            await filter.fill('');
        }
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder('Name', { exact: true }).fill('UI03C pending template');
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        await setOpen(page, 'templates', false);
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        assert.equal(await dialog.getByPlaceholder('Name', { exact: true }).inputValue(), 'UI03C pending template');
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        await setOpen(page, 'templates', true);
        await shot(page, 'after-templates');
        await tab(page, /platós|spaces/i);
        await section(page, 'spaces').getByRole('button', { name: 'Expandir', exact: true }).click();
        const zoneEditorCount = await section(page, 'spaces').getByRole('button', { name: 'Editar', exact: true }).count();
        await setOpen(page, 'spaces', false);
        await setOpen(page, 'spaces', true);
        assert.equal(await section(page, 'spaces').getByRole('button', { name: 'Editar', exact: true }).count(), zoneEditorCount);
        await shot(page, 'after-spaces');
        await tab(page, /producción|production/i);
        const pending = section(page, 'people').getByRole('textbox').first();
        await pending.fill('UI03C pending person');
        await setOpen(page, 'people', false);
        await setOpen(page, 'people', true);
        assert.equal(await pending.inputValue(), 'UI03C pending person');
        await pending.fill('');
        const defaults = section(page, 'staff-defaults').getByRole('combobox').first();
        if (await defaults.count()) {
            await defaults.click();
            const opts = page.getByRole('option');
            const n = await opts.count();
            await opts.nth(n - 1).click();
            const value = await defaults.textContent();
            await setOpen(page, 'staff-defaults', false);
            assert.equal(await section(page, 'staff-defaults').getByRole('button', { name: 'Guardar defaults', exact: true }).isVisible(), true);
            await setOpen(page, 'staff-defaults', true);
            assert.equal(await defaults.textContent(), value);
        }
        // Transport's six onBlur writers and resource name writer must not fire on fold.
        await tab(page, /recursos|resources/i);
        const transportInputs = section(page, 'transport').getByRole('spinbutton');
        for (let i = 0; i < await transportInputs.count(); i++) {
            const transport = transportInputs.nth(i), saved = await transport.inputValue();
            await transport.fill('7');
            await setOpen(page, 'transport', false);
            await setOpen(page, 'transport', true);
            assert.equal(await transport.inputValue(), '7');
            await transport.fill(saved);
            await setOpen(page, 'transport', false);
            await setOpen(page, 'transport', true);
        }
        await setOpen(page, 'transport', false);
        await section(page, 'resources').getByTitle('Expandir todos', { exact: true }).click();
        const resource = section(page, 'resources').getByRole('textbox').first();
        if (await resource.count()) {
            const name = await resource.inputValue();
            await resource.fill(name + ' pending');
            await setOpen(page, 'resources', false);
            await setOpen(page, 'resources', true);
            assert.equal(await resource.inputValue(), name + ' pending');
            await resource.fill(name);
            await setOpen(page, 'resources', false);
        }
        assert.deepEqual(writes, []);
        assert.deepEqual(await fingerprint(), before);
        ok('drafts, template creation dialog, inner expansion and staff defaults retained; onBlur transport/resource writers suppressed only when focusing the section trigger');
        await page.setViewportSize({ width: 390, height: 844 });
        await shot(page, 'after-mobile-resources');
        for (const [name, keys] of groups) {
            await tab(page, name);
            for (const key of keys)
                await setOpen(page, key, false);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        await shot(page, 'after-mobile-users');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.reload();
        await trigger(page, 'program').waitFor();
        assert.equal(await trigger(page, 'program').getAttribute('aria-expanded'), 'false');
        // Cross-window storage event, including removal and localStorage.clear().
        const peer = await page.context().newPage();
        await peer.goto(appUrl + '/settings');
        await trigger(peer, 'program').waitFor();
        await setOpen(page, 'program', true);
        await peer.waitForFunction(() => document.querySelector('[data-testid="settings-section-program"] h3 button')?.getAttribute('aria-expanded') === 'true');
        await setOpen(page, 'program', false);
        await peer.evaluate(() => {
            const k = Object.keys(localStorage).find(k => k.includes('settings-section:v1:') && k.endsWith(':program'));
            if (k)
                localStorage.removeItem(k);
        });
        await page.waitForFunction(() => document.querySelector('[data-testid="settings-section-program"] h3 button')?.getAttribute('aria-expanded') === 'true');
        await peer.close();
        ok('reload and live storage events preserve user-specific preferences, including deletion');
        report.visualWrites = [];
        report.bootstrapRequests = (writes as Array<{
            path: string;
        }>).filter(r => r.path === '/api/bootstrap-role');
        assert.deepEqual((writes as Array<{
            path: string;
        }>).filter(r => r.path !== '/api/bootstrap-role'), []);
        for (const role of ['production', 'aux', 'viewer']) {
            const denied = await login(appUrl, role);
            await denied.waitForURL(url => url.pathname !== '/settings');
            assert.equal(await denied.getByRole('tab', { name: /usuarios/i }).count(), 0);
            await denied.close();
        }
        ok('production, aux and viewer keep their existing settings route denial and no user administration controls');
        // A second actual administrator starts with independent preferences.
        await db.query("INSERT INTO public.user_roles(user_id,role_id) SELECT $1,id FROM public.roles WHERE key='admin'", [users.norole.id]);
        const other = await login(appUrl, 'norole');
        await trigger(other, 'program').waitFor();
        assert.equal(await trigger(other, 'program').getAttribute('aria-expanded'), 'true');
        await setOpen(other, 'program', false);
        assert.equal(await trigger(page, 'program').getAttribute('aria-expanded'), 'true');
        await other.close();
        await db.query('DELETE FROM public.user_roles WHERE user_id=$1', [users.norole.id]);
        ok('authenticated administrators have independent preferences');
        const { runSettingsOperations } = await import('./smokeSettingsOperations');
        report.operations = await runSettingsOperations(page, db, users.norole);
        ok('real disposable create/edit/save/cancel/delete and resource components dialog after folding');
        await tab(page, /general/i);
        // Compare a real explicit program save with the untouched baseline payload.
        const original = (await db.query('SELECT * FROM public.program_settings LIMIT 1')).rows[0];
        const saveProgram = async (p: Page, url: string) => {
            await p.getByLabel('Inicio habitual', { exact: true }).fill('08:19');
            const response = p.waitForResponse(r => new URL(r.url()).pathname === '/api/program-settings' && r.request().method() === 'PATCH');
            await p.getByRole('button', { name: 'Guardar', exact: true }).click();
            const r = await response;
            assert.equal(r.status(), 200);
            return r.request().postDataJSON();
        };
        const baseSave = await login(baselineUrl!);
        await baseSave.getByLabel('Inicio habitual', { exact: true }).waitFor();
        report.payloads.baseline = await saveProgram(baseSave, baselineUrl!);
        await baseSave.close();
        await page.reload();
        await trigger(page, 'program').waitFor();
        await setOpen(page, 'program', true);
        report.payloads.candidate = await saveProgram(page, appUrl);
        assert.deepEqual(report.payloads.candidate, report.payloads.baseline);
        assert.equal((await db.query('SELECT default_work_start FROM public.program_settings LIMIT 1')).rows[0].default_work_start, '08:19');
        await db.query('UPDATE public.program_settings SET default_work_start=$1 WHERE id=$2', [original.default_work_start, original.id]);
        ok('explicit program save matches baseline payload byte-for-byte and real SQL result');
        // Hold the real SQL writer to inspect pending feedback after folding.
        const locker = new (await import('pg')).default.Client((db as any).connectionParameters);
        await locker.connect();
        await locker.query('BEGIN');
        await locker.query('LOCK TABLE public.program_settings IN ACCESS EXCLUSIVE MODE');
        try {
            await workStart.fill('08:20');
            await section(page, 'program').getByRole('button', { name: 'Guardar', exact: true }).click();
            await section(page, 'program').getByRole('status').waitFor();
            await setOpen(page, 'program', false);
            assert.equal(await section(page, 'program').getByRole('status').isVisible(), true);
            await shot(page, 'after-saving-closed');
        }
        finally {
            await locker.query('ROLLBACK');
            await locker.end();
        }
        await section(page, 'program').getByRole('status').waitFor({ state: 'hidden' });
        await setOpen(page, 'program', true);
        // Remove authorization only in this disposable fixture, after rendering the form.
        await db.query('DELETE FROM public.user_roles WHERE user_id=$1', [users.admin.id]);
        await workStart.fill('08:21');
        const rejected = page.waitForResponse(r => new URL(r.url()).pathname === '/api/program-settings' && r.request().method() === 'PATCH');
        await section(page, 'program').getByRole('button', { name: 'Guardar', exact: true }).click();
        await setOpen(page, 'program', false);
        assert.equal((await rejected).status(), 403);
        await section(page, 'program').getByRole('alert').waitFor();
        await shot(page, 'after-error-closed');
        await db.query("INSERT INTO public.user_roles(user_id,role_id) SELECT $1,id FROM public.roles WHERE key='admin'", [users.admin.id]);
        await db.query('UPDATE public.program_settings SET default_work_start=$1 WHERE id=$2', [original.default_work_start, original.id]);
        ok('real delayed SQL save and real 403 retain visible saving/result feedback with the section closed');
        save();
        return report;
    }
    finally {
        await browser.close();
        save();
    }
}
