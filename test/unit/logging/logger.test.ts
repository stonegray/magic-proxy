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

        expect(info.message).toBe('an oversized/invalid log message was recieved.');
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
});