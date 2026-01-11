import { describe, it, expect, vi } from 'vitest';

// Mock is-docker to always return false in tests so paths resolve to ./config instead of /var/config
vi.mock('is-docker', () => ({
    default: () => false,
}));

import * as index from '../../src/index';

describe('index startApp behavior', () => {
    it('should warn and exit when proxyBackend is missing', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number): never => { throw new Error('process.exit called'); }));

        try {
            await index.startApp({});
        } catch {
            // process.exit throws in our mock
        }

        expect(consoleSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should warn and exit when proxyBackend is invalid', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number): never => { throw new Error('process.exit called'); }));

        try {
            await index.startApp({ proxyBackend: 'not-a-backend' });
        } catch {
            // process.exit throws in our mock
        }

        expect(consoleSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });
});