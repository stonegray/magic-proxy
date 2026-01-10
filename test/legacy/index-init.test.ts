import { describe, it, expect, vi } from 'vitest';
import * as index from '../../src/index';

describe('index startApp behavior', () => {
    it('should warn and exit when proxyBackend is missing', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number): never => { throw new Error('process.exit called'); }));

        try {
            await index.startApp({});
        } catch (_err) {
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
        } catch (_err) {
            // process.exit throws in our mock
        }

        expect(consoleSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });
});