import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import { setupFSMocks, getConfigPath, getTemplatePath } from '../helpers/mockHelpers';
import { loadConfigFile } from '../../src/config';

// Mock is-docker to always return false in tests so paths resolve to ./config instead of /var/config
vi.mock('is-docker', () => ({
    default: () => false,
}));

// Note: do NOT import startApp at top-level because the module auto-starts on import.
// We will dynamically import it after setting up FS mocks so module-level startup resolves
// against our mocked files.

describe('load-config functional', () => {
    let mocks: ReturnType<typeof setupFSMocks>;

    beforeEach(() => {
        const tmpl = fs.readFileSync(getTemplatePath('default.yml'), 'utf-8');
        const cfg = fs.readFileSync(getConfigPath('basic.yml'), 'utf-8');
        // Provide both the referenced example.yml (project default) and default.yml.
        // Also map the test config as the DEFAULT_CONFIG_FILE using the special key '__DEFAULT__'.
        mocks = setupFSMocks({ 'default.yml': tmpl, 'example.yml': tmpl }, { '__DEFAULT__': cfg });
    });

    afterEach(() => {
        mocks.cleanup();
    });

    it('loads the fake config and initializes the app', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        await loadConfigFile(getConfigPath('basic.yml'));

        // Dynamically import the index module after FS mocks are in place so module startup succeeds
        await import('../../src/index');

        // The module-level initialization is started without awaiting; wait until the
        // "Initialization complete." log appears (or timeout).
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                clearInterval(interval);
                reject(new Error('Initialization did not complete within timeout'));
            }, 2000);

            const interval = setInterval(() => {
                if (logSpy.mock.calls.some(c => c[0] === 'Initialization complete.')) {
                    clearTimeout(timeout);
                    clearInterval(interval);
                    resolve();
                }
            }, 20);
        });

        expect(logSpy).toHaveBeenCalledWith('Initialization complete.');

        logSpy.mockRestore();
    });

    it('exits when default config is empty', async () => {
        // Replace the mocks to provide an empty default config
        mocks.cleanup();
        const tmpl = fs.readFileSync(getTemplatePath('default.yml'), 'utf-8');
        const emptyCfg = fs.readFileSync(getConfigPath('empty.yml'), 'utf-8');
        mocks = setupFSMocks({ 'default.yml': tmpl, 'example.yml': tmpl }, { '__DEFAULT__': emptyCfg });

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Import the module (if not already imported this will trigger module startup)
        const mod = await import('../../src/index');

        // If module was already imported and didn't auto-exit, call startApp with an empty
        // config object - this should trigger the same validation error path and call process.exit
        if (exitSpy.mock.calls.length === 0) {
            await (mod as any).startApp({});
        }

        expect(errSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);

        // Verify the logged error message indicates missing proxyBackend
        const logged = errSpy.mock.calls;
        const found = logged.some((c: any[]) => c[1] === 'No proxyBackend configured');
        expect(found).toBe(true);

        exitSpy.mockRestore();
        errSpy.mockRestore();
    });

    it('exits when default config file cannot be found', async () => {
        // cleanup previous mocks, set up only templates (no default config)
        mocks.cleanup();
        const tmpl = fs.readFileSync(getTemplatePath('default.yml'), 'utf-8');
        mocks = setupFSMocks({ 'default.yml': tmpl }, {});

        // Make readFile reject for the DEFAULT_CONFIG_FILE path while falling back for others
        const origRead = fs.promises.readFile.bind(fs.promises);
        const readSpy = vi.spyOn(fs.promises, 'readFile').mockImplementation((p, enc) => {
            if (String(p).includes('magic-proxy.yml')) return Promise.reject(new Error('ENOENT: no such file or directory'));
            return origRead(p, enc);
        });

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        const mod = await import('../../src/index');
        if (exitSpy.mock.calls.length === 0) {
            await (mod as any).startApp();
        }

        expect(errSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);

        const logged = errSpy.mock.calls;
        const found = logged.some((c: any[]) => c[1] && String(c[1]).includes('Error loading config file at'));
        expect(found).toBe(true);

        readSpy.mockRestore();
        exitSpy.mockRestore();
        errSpy.mockRestore();
    });
});
