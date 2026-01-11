import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logging/silent-console-in-tests', () => {
    let oldEnv: string | undefined;

    beforeEach(() => {
        oldEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
        process.env.NODE_ENV = oldEnv;
        // Reset module cache so other tests import the default logger
        vi.resetModules();
    });

    it('creates console transport with silent=true when NODE_ENV=test', async () => {
        process.env.NODE_ENV = 'test';
        vi.resetModules();

        const mod = await import('../../../src/logging/logger');
        const transports = (mod as any).baseLogger.transports;

        const consoleTransport = transports.find((t: any) => t.name === 'console' || t.constructor && t.constructor.name === 'Console');
        expect(consoleTransport).toBeDefined();
        expect(consoleTransport.silent).toBe(true);
    });

    it('keeps console transport active when not in test env', async () => {
        process.env.NODE_ENV = 'development';
        vi.resetModules();

        const mod = await import('../../../src/logging/logger');
        const transports = (mod as any).baseLogger.transports;

        const consoleTransport = transports.find((t: any) => t.name === 'console' || t.constructor && t.constructor.name === 'Console');
        expect(consoleTransport).toBeDefined();
        expect(consoleTransport.silent).toBe(false);
    });
});