import { describe, it, expect } from 'vitest';
import { validateXMagicProxyData } from '../../../src/types/xmagic';

describe('types/xmagic - validateXMagicProxyData', () => {
    it('accepts minimal valid config', () => {
        const data = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com'
        };

        const res = validateXMagicProxyData(data);
        expect(res.valid).toBe(true);
        expect(res.valid && res.value.template).toBe('example.yml');
    });

    it('accepts empty userData object', () => {
        const data = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com',
            userData: {}
        };

        const res = validateXMagicProxyData(data);
        expect(res.valid).toBe(true);
    });

    it('accepts multiple userData key value pairs', () => {
        const data = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com',
            userData: { bar: 'foo', baz: 'zap' }
        };

        const res = validateXMagicProxyData(data);
        expect(res.valid).toBe(true);
        expect(res.valid && res.value.userData?.bar).toBe('foo');
    });

    it('rejects non-URL target values', () => {
        const data = {
            template: 'example.yml',
            target: 'not-a-url',
            hostname: 'example.com'
        };

        const res = validateXMagicProxyData(data);
        expect(res.valid).toBe(false);
        expect(res.valid === false && typeof res.reason === 'string').toBe(true);
        expect(res.valid === false && res.reason!.toLowerCase()).toContain('target');
    });

    it('accepts http and https URLs with IPv4 addresses', () => {
        const data1 = {
            template: 'example.yml',
            target: 'http://127.0.0.1:3000',
            hostname: 'example.com'
        };
        const data2 = {
            template: 'example.yml',
            target: 'https://192.168.0.1',
            hostname: 'example.com'
        };

        const r1 = validateXMagicProxyData(data1);
        const r2 = validateXMagicProxyData(data2);
        expect(r1.valid).toBe(true);
        expect(r2.valid).toBe(true);
    });

    it('accepts IPv6 addresses in URLs', () => {
        const data1 = {
            template: 'example.yml',
            target: 'http://[::1]:3000',
            hostname: 'example.com'
        };
        const data2 = {
            template: 'example.yml',
            target: 'https://[2001:db8::1]',
            hostname: 'example.com'
        };

        const r1 = validateXMagicProxyData(data1);
        const r2 = validateXMagicProxyData(data2);
        expect(r1.valid).toBe(true);
        expect(r2.valid).toBe(true);
    });

    it('accepts hostname URLs including localhost and subdomains', () => {
        const data1 = {
            template: 'example.yml',
            target: 'http://localhost:8080',
            hostname: 'example.com'
        };
        const data2 = {
            template: 'example.yml',
            target: 'https://api.example.co.uk',
            hostname: 'example.com'
        };

        const r1 = validateXMagicProxyData(data1);
        const r2 = validateXMagicProxyData(data2);
        expect(r1.valid).toBe(true);
        expect(r2.valid).toBe(true);
    });

    it('rejects URLs without a protocol', () => {
        const data = {
            template: 'example.yml',
            target: 'example.com:3000',
            hostname: 'example.com'
        };

        const res = validateXMagicProxyData(data);
        expect(res.valid).toBe(false);
        expect(res.valid === false && res.reason!.toLowerCase()).toContain('target');
    });

    it('rejects non-http/https protocols', () => {
        const data1 = {
            template: 'example.yml',
            target: 'ftp://example.com',
            hostname: 'example.com'
        };
        const data2 = {
            template: 'example.yml',
            target: 'ws://example.com',
            hostname: 'example.com'
        };

        const r1 = validateXMagicProxyData(data1);
        const r2 = validateXMagicProxyData(data2);
        expect(r1.valid).toBe(false);
        expect(r2.valid).toBe(false);
        expect(r1.valid === false && r1.reason!.toLowerCase()).toContain('http');
        expect(r2.valid === false && r2.reason!.toLowerCase()).toContain('http');
    });

    it('rejects userData values that are objects (no nested objects)', () => {
        const data = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com',
            userData: { nested: { a: 1 } }
        };

        const res = validateXMagicProxyData(data);
        expect(res.valid).toBe(false);
        expect(res.valid === false && res.reason!.toLowerCase()).toContain('userdata');
    });

    it('rejects missing required fields', () => {
        const missingTemplate = { target: 'http://localhost:3000', hostname: 'example.com' };
        const missingTarget = { template: 'example.yml', hostname: 'example.com' };
        const missingHostname = { template: 'example.yml', target: 'http://localhost:3000' };

        const r1 = validateXMagicProxyData(missingTemplate);
        const r2 = validateXMagicProxyData(missingTarget);
        const r3 = validateXMagicProxyData(missingHostname);

        expect(r1.valid).toBe(false);
        expect(r2.valid).toBe(false);
        expect(r3.valid).toBe(false);

        expect(r1.valid === false && r1.reason!.toLowerCase()).toContain('template');
        expect(r2.valid === false && r2.reason!.toLowerCase()).toContain('target');
        expect(r3.valid === false && r3.reason!.toLowerCase()).toContain('hostname');
    });
});