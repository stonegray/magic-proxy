import { describe, it, expect, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HostDB } from '../../src/hostDb';
import { attachHostDbToBackend } from '../../src/hostDispatcher';
import * as backendPlugin from '../../src/backends/backendPlugin';
import { HostEntry } from '../../src/types/host';

describe('hostDispatcher', () => {
    it('should call backendPlugin.addProxiedApp on added and updated, and removeProxiedApp on removed', async () => {
        const addSpy = vi.spyOn(backendPlugin, 'addProxiedApp').mockResolvedValue(undefined as any);
        const removeSpy = vi.spyOn(backendPlugin, 'removeProxiedApp').mockResolvedValue(undefined as any);

        const hostDb = new HostDB();
        attachHostDbToBackend(hostDb);

        const entry: HostEntry = {
            containerName: 'h1',
            xMagicProxy: { target: 'http://1', hostname: 'h' } as any,
            composeFilePath: '/tmp',
            composeData: {} as any,
            lastChanged: Date.now(),
            state: {},
        };

        hostDb.upsert(entry);
        expect(addSpy).toHaveBeenCalledWith(entry);

        // simulate update using a new object reference (real systems create new HostEntry objects)
        const updatedEntry = { ...entry, state: { needsUpdate: true }, lastChanged: Date.now() };
        hostDb.upsert(updatedEntry);
        expect(addSpy).toHaveBeenCalledTimes(2);

        // remove
        hostDb.remove(entry.containerName);
        expect(removeSpy).toHaveBeenCalledWith(entry.containerName);

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });
});