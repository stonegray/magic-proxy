import { EventEmitter } from 'events';
import { zone } from './logging/zone';

const log = zone('apiMessageBroker');

interface FieldData {
    [key: string]: unknown;
}

class APIMessageBroker extends EventEmitter {
    private fields: Map<string, FieldData> = new Map();

    /**
     * Set a field that will be exposed via the API
     * Emits a 'field:update' event with the field name and data
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
     * Basic sanitization to prevent injection
     * Ensures all values are primitives or safe objects
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
