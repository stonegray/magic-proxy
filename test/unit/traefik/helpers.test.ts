import { describe, it, expect } from 'vitest';
import { getErrorMessage, detectCollisions } from '../../../src/backends/traefik/helpers';

describe('Traefik helpers', () => {
    describe('getErrorMessage', () => {
        it('extracts message from Error objects', () => {
            const error = new Error('Something went wrong');
            expect(getErrorMessage(error)).toBe('Something went wrong');
        });

        it('converts non-Error values to strings', () => {
            expect(getErrorMessage('string error')).toBe('string error');
            expect(getErrorMessage(123)).toBe('123');
            expect(getErrorMessage(null)).toBe('null');
            expect(getErrorMessage(undefined)).toBe('undefined');
        });

        it('handles objects by converting to string', () => {
            expect(getErrorMessage({ code: 'ERR' })).toBe('[object Object]');
        });
    });

    describe('detectCollisions', () => {
        it('returns empty array when no collisions', () => {
            const target = { a: 1, b: 2 };
            const source = { c: 3, d: 4 };
            expect(detectCollisions(target, source)).toEqual([]);
        });

        it('detects single collision', () => {
            const target = { a: 1, b: 2 };
            const source = { b: 3, c: 4 };
            expect(detectCollisions(target, source)).toEqual(['b']);
        });

        it('detects multiple collisions', () => {
            const target = { a: 1, b: 2, c: 3 };
            const source = { a: 10, c: 30, d: 40 };
            expect(detectCollisions(target, source)).toEqual(['a', 'c']);
        });

        it('handles empty target', () => {
            const source = { a: 1, b: 2 };
            expect(detectCollisions({}, source)).toEqual([]);
        });

        it('handles empty source', () => {
            const target = { a: 1, b: 2 };
            expect(detectCollisions(target, {})).toEqual([]);
        });

        it('handles both empty', () => {
            expect(detectCollisions({}, {})).toEqual([]);
        });

        it('handles undefined arguments with defaults', () => {
            expect(detectCollisions(undefined, undefined)).toEqual([]);
            expect(detectCollisions({ a: 1 }, undefined)).toEqual([]);
            expect(detectCollisions(undefined, { a: 1 })).toEqual([]);
        });
    });
});
