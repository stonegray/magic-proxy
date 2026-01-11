import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
 
import fs from 'fs';
import { setupFSMocks, getConfigPath, getTemplatePath, createMockHostEntry } from '../helpers/mockHelpers';
import { loadConfigFile } from '../../src/config';
import * as traefik from '../../src/backends/traefik/traefik';

describe('multiple templates config', () => {
    let mocks: ReturnType<typeof setupFSMocks>;

    beforeEach(() => {
        const tmpl1 = fs.readFileSync(getTemplatePath('default.yml'), 'utf-8');
        const tmpl2 = fs.readFileSync(getTemplatePath('default2.yml'), 'utf-8');
        const cfg = fs.readFileSync(getConfigPath('multiple-templates.yml'), 'utf-8');
        mocks = setupFSMocks({ 'default.yml': tmpl1, 'default2.yml': tmpl2 }, { '__DEFAULT__': cfg });
    });

    afterEach(() => {
        mocks.cleanup();
        traefik._resetForTesting();
    });

    it('loads both templates and can register apps using each', async () => {
        const cfg = await loadConfigFile(getConfigPath('multiple-templates.yml'));
        // ensure clean state and initialize traefik backend with loaded config
        traefik._resetForTesting();
        await traefik.initialize(cfg as any);

        const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

        const entry1 = createMockHostEntry({ containerName: 'app1', xMagicProxy: { template: 'default.yml', target: 'http://1.1.1.1', hostname: 'a.test' } as any });
        const entry2 = createMockHostEntry({ containerName: 'app2', xMagicProxy: { template: 'default2.yml', target: 'http://2.2.2.2', hostname: 'b.test' } as any });

        await traefik.addProxiedApp(entry1);
        await traefik.addProxiedApp(entry2);

        // Check the last write contains both app names
        const calls = writeSpy.mock.calls as [string, string][];
        const lastContent = calls[calls.length - 1][1];
        expect(lastContent).toContain('app1');
        expect(lastContent).toContain('app2');

        writeSpy.mockRestore();
    });
});