import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
 
import * as traefik from '../../src/backends/traefik/traefik';
import * as manager from '../../src/backends/traefik/traefikManager';
import { HostEntry } from '../../src/types/host';
import { XMagicProxyData } from '../../src/types/xmagic';
import fs from 'fs';
import path from 'path';
import { OUTPUT_DIRECTORY } from '../../src/config';

describe('Traefik file output', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    traefik._resetForTesting();
    writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    // Set up a default template for testing
    traefik._setTemplateForTesting('default', `
http:
  routers:
    magic-proxy-{{ app_name }}:
      rule: Host(\`{{ app_name }}.{{ hostname }}\`)
      service: magic-proxy-{{ app_name }}
      entryPoints:
        - web
  services:
    magic-proxy-{{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes combined traefik yaml to configured OUTPUT_DIRECTORY when outputFile is relative', async () => {
    // Set output file for manager
    const expectedPath = path.resolve(OUTPUT_DIRECTORY, 'traefik-magic.yml');
    manager.setOutputFile(expectedPath);

    const entry: HostEntry = {
      containerName: 'appfile',
      xMagicProxy: { template: 'default', target: 'http://1.2.3.4', hostname: 'example.test' } as XMagicProxyData,
      composeFilePath: '/tmp/docker-compose.yml',
      composeData: {} as Partial<typeof entry.composeData>,
      lastChanged: Date.now(),
      state: {},
    };

    // also spy on rename to ensure atomic move
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockResolvedValue(undefined as any);

    await traefik.addProxiedApp(entry);

    expect(writeSpy).toHaveBeenCalled();

    const calls = writeSpy.mock.calls as [string, string][];
    const [actualPath, actualContent] = calls[calls.length - 1];

    // If atomic write is used, file is written to tmp and then renamed into place
    if (actualPath.endsWith('.tmp')) {
      expect(renameSpy).toHaveBeenCalled();
      const renameArgs = renameSpy.mock.calls[renameSpy.mock.calls.length - 1];
      expect(renameArgs[1]).toBe(expectedPath);
      // Content should still contain the rendered data
      expect(actualContent).toContain('appfile.example.test');
      expect(actualContent).toContain('http://1.2.3.4');
    } else {
      // legacy behavior: wrote directly
      expect(actualPath).toBe(expectedPath);
      expect(actualContent).toContain('appfile.example.test');
      expect(actualContent).toContain('http://1.2.3.4');
    }

    renameSpy.mockRestore();
  });
});