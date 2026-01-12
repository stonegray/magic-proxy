/**
 * API Message Broker — Security layer for API field exposure
 *
 * This module provides a controlled, secure way to expose selected runtime
 * fields via the public API (for example: GET /api/:fieldName and
 * GET /api/routes).
 *
 * Key responsibilities:
 * - Allow only explicitly set, named fields to be exposed (no implicit data leaks)
 * - Validate field names (alphanumeric, underscore, dash; 1-64 chars)
 * - Sanitize field values to be JSON-serializable and safe to publish
 * - Emit 'field:update' when fields change so the API can reflect updates
 *
 * Use the exported singleton `apiMessageBroker` to publish or query fields.
 *
 * Security note: Consumers must call `setField()` only with explicit, vetted
 * data. This broker rejects non-serializable values (functions, symbols,
 * undefined, circular references) and logs violations for auditing.
 */
import { EventEmitter } from 'events';
import { zone } from './logging/zone';

const log = zone('apiMessageBroker');

interface FieldData {
    [key: string]: unknown;
}


class APIMessageBroker extends EventEmitter {
    private fields: Map<string, FieldData> = new Map();

    /**
     * Publish a named field for exposure via the API.
     *
     * Security/behavior:
     * - Validates the name with `_isValidFieldName()` to prevent path traversal or
     *   route collisions.
     * - Sanitizes the data with `_isSanitized()` to ensure it's JSON-serializable
     *   and safe to publish.
     * - On failure, logs at warn/error level and refuses to set the field.
     *
     * Emits: 'field:update' with { name, data } when the field is successfully set.
     */
    setField(name: string, data: FieldData): void {
        if (!this._isValidFieldName(name)) {
            log.warn({ message: 'Invalid field name', data: { name } });
            return;
        }

        if (!this._isSanitized(data)) {
            log.error({ message: 'Field data failed sanitization', data: { name } });
            return;
        }

        this.fields.set(name, data);
        log.debug({ message: 'Field set', data: { name } });
        this.emit('field:update', { name, data });
    }

    /**
     * Get multiple fields by name
     */
    getFields(fieldNames: string[]): Map<string, FieldData> {
        const result = new Map<string, FieldData>();
        for (const name of fieldNames) {
            const data = this.fields.get(name);
            if (data) {
                result.set(name, data);
            }
        }
        return result;
    }

    /**
     * Get a single field by name
     */
    getField(name: string): FieldData | undefined {
        return this.fields.get(name);
    }

    /**
     * Get all available route names
     */
    getRoutes(): string[] {
        return Array.from(this.fields.keys());
    }

    /**
     * Validate field name contains only safe characters
     */
    private _isValidFieldName(name: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 64;
    }

    /**
     * Ensure field data is safe for public exposure.
     *
     * Rules:
     * - Allowed value types: string, number, boolean, null, object, array
     * - Reject functions, symbols, undefined, and other non-serializable types
     * - For objects/arrays, attempt JSON.stringify() to catch circular refs and
     *   non-serializable values
     * - Returns true when data is safe to publish; false otherwise
     */
    private _isSanitized(data: FieldData): boolean {
        try {
            for (const value of Object.values(data)) {
                if (
                    value !== null &&
                    typeof value !== 'string' &&
                    typeof value !== 'number' &&
                    typeof value !== 'boolean' &&
                    !Array.isArray(value) &&
                    typeof value !== 'object'
                ) {
                    return false;
                }

                // If it's an object/array, recursively check it's JSON serializable
                if (typeof value === 'object') {
                    try {
                        JSON.stringify(value);
                    } catch {
                        return false;
                    }
                }
            }
            return true;
        } catch {
            return false;
        }
    }
}

// Export singleton instance
export const apiMessageBroker = new APIMessageBroker();
