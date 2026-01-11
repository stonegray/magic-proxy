import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import * as manager from '../../../src/backends/traefik/traefikManager';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Traefik Manager - Temp File Cleanup', () => {
  let testDir: string;
  let outputPath: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'traefik-test-'));
    outputPath = path.join(testDir, 'traefik-magic.yml');
    manager._resetForTesting();
    manager.setOutputFile(outputPath);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
    manager._resetForTesting();
  });

  it('should clean up stale .tmp files when writing config', async () => {
    // Create some fake stale .tmp files
    const staleTmp1 = `${outputPath}.12345-1234567890.tmp`;
    const staleTmp2 = `${outputPath}.67890-9876543210.tmp`;
    
    await fs.writeFile(staleTmp1, 'stale content 1', 'utf-8');
    await fs.writeFile(staleTmp2, 'stale content 2', 'utf-8');

    // Verify stale files exist
    let files = await fs.readdir(testDir);
    expect(files).toContain(path.basename(staleTmp1));
    expect(files).toContain(path.basename(staleTmp2));

    // Register a simple config and flush
    manager.register('testapp', {
      http: {
        routers: {
          'test-router': {
            rule: 'Host(`test.example.com`)',
            service: 'test-service',
          },
        },
        services: {
          'test-service': {
            loadBalancer: {
              servers: [{ url: 'http://localhost:3000' }],
            },
          },
        },
      },
    });

    await manager.flushToDisk();

    // Verify that the stale .tmp files have been cleaned up
    files = await fs.readdir(testDir);
    expect(files).not.toContain(path.basename(staleTmp1));
    expect(files).not.toContain(path.basename(staleTmp2));
    
    // Verify the actual output file was created
    expect(files).toContain('traefik-magic.yml');
    
    // Verify no .tmp files remain
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('should clean up its own .tmp file on write error', async () => {
    // Mock rename to fail
    const originalRename = fs.rename;
    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValue(new Error('Simulated rename failure'));

    manager.register('testapp', {
      http: {
        routers: {
          'test-router': {
            rule: 'Host(`test.example.com`)',
            service: 'test-service',
          },
        },
      },
    });

    // Flush should fail
    await expect(manager.flushToDisk()).rejects.toThrow('Simulated rename failure');

    // Verify no .tmp files were left behind
    const files = await fs.readdir(testDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);

    renameSpy.mockRestore();
  });

  it('should not fail if temp directory does not exist yet', async () => {
    // Use a non-existent directory
    const nonExistentPath = path.join(testDir, 'subdir', 'traefik-magic.yml');
    manager.setOutputFile(nonExistentPath);

    manager.register('testapp', {
      http: {
        routers: {
          'test-router': {
            rule: 'Host(`test.example.com`)',
            service: 'test-service',
          },
        },
      },
    });

    // Should create directory and write successfully
    await expect(manager.flushToDisk()).resolves.not.toThrow();

    // Verify file was created
    const fileExists = await fs.access(nonExistentPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
  });
});
