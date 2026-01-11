import { describe, it, expect } from 'vitest';
import * as winston from 'winston';
import { lowerCaseLevel } from '../../../src/logging/logger';


describe('logging/format', () => {
    it('prints full lowercase level and zone bracketed (without colorization)', () => {
        // Build a similar format chain without colorize to avoid color module dependency in tests
        const fmt: any = winston.format.combine(
            lowerCaseLevel(),
            winston.format.printf((info) => {
                const levelLabel = (info.level as string) ?? '';
                const zone = info.zone ?? 'core';
                return `[${levelLabel}][${zone}] ${info.message}`;
            })
        );

        const out = fmt.transform({ level: 'INFO', message: 'Starting Magic Proxy application', zone: 'index' });
        const msg = out[Symbol.for('message')] || out.message || '';
        expect(String(msg)).toContain('[info][index] Starting Magic Proxy application');
    });
});