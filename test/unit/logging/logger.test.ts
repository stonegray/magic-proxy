import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zone } from '../../../src/logging/zone';
import { overflowGuard, formatDataForConsole, OVERSIZE_THRESHOLD } from '../../../src/logging/logger';

describe('logging/logger', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('overflowGuard replaces oversized data with logger-level error & stack', () => {
        const fmt = overflowGuard();
        const big = 'x'.repeat(OVERSIZE_THRESHOLD + 1);
        const info = fmt.transform({ level: 'info', message: 'm', data: big } as any);

        expect(info.message).toBe('an oversized/invalid log message was received.');
        expect(info.zone).toBe('logger');
        expect((info as any).data).toHaveProperty('stack');
        expect((info as any).data).toHaveProperty('bytes', OVERSIZE_THRESHOLD + 1);
        expect(info.level).toBe('error');
    });

    it('formatDataForConsole truncates long strings and reports bytes', () => {
        const long = 'a'.repeat(5_000);
        const formatted = formatDataForConsole(long);
        expect(formatted).toContain('<truncated');
        expect(formatted).toContain('bytes');
    });

    it('serialize/overflow handles: string, null, NaN, Infinity, object, Buffer', () => {
        const fmt = overflowGuard();

        const s = fmt.transform({ level: 'info', message: 'm', data: 'hello' } as any);
        expect((s as any).__serializedData).toBe('hello');

        const n = fmt.transform({ level: 'info', message: 'm', data: null } as any);
        expect((n as any).__serializedData).toBe('null');

        const nan = fmt.transform({ level: 'info', message: 'm', data: NaN } as any);
        expect((nan as any).__serializedData).toBe('NaN');

        const inf = fmt.transform({ level: 'info', message: 'm', data: Infinity } as any);
        expect((inf as any).__serializedData).toBe('Infinity');

        const obj = fmt.transform({ level: 'info', message: 'm', data: { x: 1 } } as any);
        expect((obj as any).__serializedData).toBe(JSON.stringify({ x: 1 }));

        const buf = fmt.transform({ level: 'info', message: 'm', data: Buffer.from('abc') } as any);
        expect((buf as any).__serializedData).toMatch(/^<Buffer base64:[A-Za-z0-9+/]+=*>$/);
    });

    it('overflowGuard serializes common types without error', () => {
        const fmt = overflowGuard();

        const symInfo = fmt.transform({ level: 'info', message: 'm', data: Symbol('s') } as any);
        expect(symInfo.message).toBe('m');
        expect(symInfo.zone).not.toBe('logger');
        expect((symInfo as any).__serializedData).toBe('Symbol(s)');

        const fnInfo = fmt.transform({ level: 'info', message: 'm', data: () => { } } as any);
        expect(fnInfo.message).toBe('m');
        expect(fnInfo.zone).not.toBe('logger');
        expect((fnInfo as any).__serializedData).toMatch(/^<function:/);
    });
    it('overflowGuard treats missing or undefined data as absent (does not serialize)', () => {
        const fmt = overflowGuard();
        const missingInfo = fmt.transform({ level: 'info', message: 'm' } as any);
        expect((missingInfo as any).__serializedData).toBeUndefined();

        const uInfo = fmt.transform({ level: 'info', message: 'm', data: undefined } as any);
        expect(uInfo.message).toBe('m');
        expect(uInfo.zone).not.toBe('logger');
        expect((uInfo as any).__serializedData).toBeUndefined();
    });
});