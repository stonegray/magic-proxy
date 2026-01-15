import { describe, it, expect } from 'vitest';
import { getErrorMessage, detectCollisions } from '../../../src/backends/traefik/helpers';

describe('Traefik Helpers', () => {
    describe('getErrorMessage', () => {
        it('extracts message from Error object', () => {
            const error = new Error('Something went wrong');
            expect(getErrorMessage(error)).toBe('Something went wrong');
        });

        it('converts string to string', () => {
            expect(getErrorMessage('plain string error')).toBe('plain string error');
        });

        it('converts number to string', () => {
            expect(getErrorMessage(42)).toBe('42');
        });

        it('converts null to string', () => {
            expect(getErrorMessage(null)).toBe('null');
        });

        it('converts undefined to string', () => {
            expect(getErrorMessage(undefined)).toBe('undefined');
        });

        it('converts object to string', () => {
            const obj = { code: 'ERR_UNKNOWN' };
            expect(getErrorMessage(obj)).toBe('[object Object]');
        });

        it('handles TypeError', () => {
            const error = new TypeError('Invalid type');
            expect(getErrorMessage(error)).toBe('Invalid type');
        });

        it('handles custom Error subclass', () => {
            class CustomError extends Error {
                constructor(message: string) {
                    super(message);
                    this.name = 'CustomError';
                }
            }
            const error = new CustomError('Custom error message');
            expect(getErrorMessage(error)).toBe('Custom error message');
        });
    });

    describe('detectCollisions', () => {
        it('detects single collision', () => {
            const target = { foo: 1, bar: 2 };
            const source = { foo: 3, baz: 4 };
            const collisions = detectCollisions(target, source);
            expect(collisions).toEqual(['foo']);
        });

        it('detects multiple collisions', () => {
            const target = { foo: 1, bar: 2, baz: 3 };
            const source = { foo: 10, bar: 20, qux: 40 };
            const collisions = detectCollisions(target, source);
            expect(collisions).toContain('foo');
            expect(collisions).toContain('bar');
            expect(collisions).toHaveLength(2);
        });

        it('returns empty array when no collisions', () => {
            const target = { foo: 1, bar: 2 };
            const source = { baz: 3, qux: 4 };
            const collisions = detectCollisions(target, source);
            expect(collisions).toEqual([]);
        });

        it('handles empty target', () => {
            const target = {};
            const source = { foo: 1, bar: 2 };
            const collisions = detectCollisions(target, source);
            expect(collisions).toEqual([]);
        });

        it('handles empty source', () => {
            const target = { foo: 1, bar: 2 };
            const source = {};
            const collisions = detectCollisions(target, source);
            expect(collisions).toEqual([]);
        });

        it('handles both empty objects', () => {
            const collisions = detectCollisions({}, {});
            expect(collisions).toEqual([]);
        });

        it('handles undefined target (default parameter)', () => {
            const source = { foo: 1, bar: 2 };
            const collisions = detectCollisions(undefined, source);
            expect(collisions).toEqual([]);
        });

        it('handles undefined source (default parameter)', () => {
            const target = { foo: 1, bar: 2 };
            const collisions = detectCollisions(target, undefined);
            expect(collisions).toEqual([]);
        });

        it('works with different value types', () => {
            const target = { str: 'hello', num: 42, bool: true };
            const source = { str: 'world', obj: { nested: 'value' } };
            const collisions = detectCollisions(target, source);
            expect(collisions).toEqual(['str']);
        });

        it('detects all keys when source is subset of target', () => {
            const target = { a: 1, b: 2, c: 3, d: 4 };
            const source = { a: 10, c: 30 };
            const collisions = detectCollisions(target, source);
            expect(collisions).toContain('a');
            expect(collisions).toContain('c');
            expect(collisions).toHaveLength(2);
        });

        it('preserves order of keys from source', () => {
            const target = { a: 1, b: 2, c: 3 };
            const source = { c: 30, a: 10, b: 20 };
            const collisions = detectCollisions(target, source);
            // Object.keys() order in modern JS follows insertion order
            expect(collisions).toEqual(['c', 'a', 'b']);
        });
    });
});
