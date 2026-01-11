import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { zone } from '../../../src/logging/zone';
import { baseLogger } from '../../../src/logging/logger';

describe('logging/zone', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('attaches data when provided and not private', () => {
        const mock = vi.spyOn(baseLogger, 'info').mockImplementation(() => { });
        const log = zone('myzone.subzone');

        const data = { a: 1 };
        log.info({ message: 'payload', data });

        expect(mock).toHaveBeenCalledWith('payload', { zone: 'myzone.subzone', data });
    });

    it('replaces data with "<private>" when private is true', () => {
        const mock = vi.spyOn(baseLogger, 'info').mockImplementation(() => { });
        const log = zone('myzone.subzone');

        log.info({ message: 'secret', data: { token: 'x' }, private: true });

        expect(mock).toHaveBeenCalledWith('secret', { zone: 'myzone.subzone', data: '<private>' });
    });

    it('works for other log levels', () => {
        const errorMock = vi.spyOn(baseLogger, 'error').mockImplementation(() => { });
        const warnMock = vi.spyOn(baseLogger, 'warn').mockImplementation(() => { });
        const debugMock = vi.spyOn(baseLogger, 'debug').mockImplementation(() => { });

        const log = zone('z');
        log.error({ message: 'err' });
        log.warn({ message: 'w', data: { x: 1 } });
        log.debug({ message: 'd', private: true, data: { s: 's' } });

        expect(errorMock).toHaveBeenCalledWith('err', { zone: 'z' });
        expect(warnMock).toHaveBeenCalledWith('w', { zone: 'z', data: { x: 1 } });
        expect(debugMock).toHaveBeenCalledWith('d', { zone: 'z', data: '<private>' });
    });
    it('does not include a data key when logging only a message payload', () => {
        const mock = vi.spyOn(baseLogger, 'info').mockImplementation(() => { });
        const log = zone('myzone.subzone');

        log.info({ message: 'hello only' });

        expect(mock).toHaveBeenCalledWith('hello only', { zone: 'myzone.subzone' });

        mock.mockRestore();
    });
});