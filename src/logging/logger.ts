import * as winston from "winston";
import type { Logform } from 'winston';
import fs from 'fs';
import path from 'path';
import util from 'util';

// Configuration constants
export const OVERSIZE_THRESHOLD = 100_000; // bytes
export const CONSOLE_TRUNCATE_LENGTH = 1_000; // characters
const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'app.log');

// Log info type with custom fields
type LogInfo = Logform.TransformableInfo & {
    __serializedData?: string;
    zone?: string;
    data?: unknown;
    timestamp?: string;
};

// Define colors for levels
const levelColors: Record<string, string> = {
    info: 'cyan',
    debug: 'gray',
    error: 'red',
    warn: 'yellow'
};

winston.addColors(levelColors);

// Ensure log directory exists for file transport
try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (err) {
    console.error('[Logger] Failed to ensure log directory exists:', err);
}

/**
 * Type-aware serialization for log data.
 * Safely converts any value to a string for logging.
 */
export function serializeLogData(data: unknown): string {
    if (typeof data === 'string') return data;
    if (data === null) return 'null';
    if (data === undefined) return '';

    if (typeof data === 'number') {
        if (Number.isNaN(data)) return 'NaN';
        if (!Number.isFinite(data)) return data > 0 ? 'Infinity' : '-Infinity';
        return String(data);
    }

    if (typeof data === 'boolean') return data ? 'true' : 'false';
    if (typeof data === 'symbol') return data.toString();

    if (typeof data === 'function') {
        return `<function:${data.name || 'anonymous'}>`;
    }

    if (Buffer.isBuffer(data)) {
        return `<Buffer base64:${data.toString('base64')}>`;
    }

    // Objects: try JSON.stringify, fallback to util.inspect for circular refs
    try {
        return JSON.stringify(data);
    } catch {
        return util.inspect(data, { depth: 2, breakLength: Infinity });
    }
}

/**
 * Winston format that checks data size and replaces oversized payloads with an error.
 */
export const overflowGuard = winston.format((info: LogInfo) => {
    if (!Object.prototype.hasOwnProperty.call(info, 'data') || info.data === undefined) {
        return info;
    }

    let serialized: string;
    try {
        serialized = serializeLogData(info.data);
    } catch (err) {
        const stack = err instanceof Error && err.stack ? err.stack : String(err);
        info.zone = 'logger';
        info.message = 'an oversized/invalid log message was received.';
        info.data = { stack, bytes: 0 };
        info.level = 'error';
        return info;
    }

    info.__serializedData = serialized;
    const bytes = Buffer.byteLength(serialized, 'utf8');

    if (bytes > OVERSIZE_THRESHOLD) {
        try {
            throw new Error('Oversized log message');
        } catch (err) {
            const stack = err instanceof Error && err.stack ? err.stack : String(err);
            info.zone = 'logger';
            info.message = 'an oversized/invalid log message was received.';
            info.data = { stack, bytes };
            info.level = 'error';
        }
    }

    return info;
});

/**
 * Format data for console output with truncation.
 */
export function formatDataForConsole(data: unknown): string {
    if (data === undefined) return '';

    let s: string;
    try {
        s = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch {
        s = String(data);
    }

    if (s.length > CONSOLE_TRUNCATE_LENGTH) {
        const bytes = Buffer.byteLength(s, 'utf8');
        return s.slice(0, CONSOLE_TRUNCATE_LENGTH) + ` ... <truncated ${bytes} bytes>`;
    }

    return s;
}

/**
 * Winston format to normalize log levels to lowercase.
 */
export const lowerCaseLevel = winston.format((info) => {
    if (info.level) info.level = String(info.level).toLowerCase();
    return info;
});

// Console format with colored output
export const consoleFormat = winston.format.combine(
    overflowGuard(),
    lowerCaseLevel(),
    winston.format.colorize({ all: false }),
    winston.format.printf((info: LogInfo) => {
        const levelLabel = (info.level as string) ?? '';
        const zone = info.zone ?? 'core';
        const dataSource = info.__serializedData ?? (Object.prototype.hasOwnProperty.call(info, 'data') ? info.data : undefined);
        const dataPart = dataSource !== undefined ? ' ' + formatDataForConsole(dataSource) : '';
        return `[${levelLabel}][${zone}] ${info.message}${dataPart}`;
    })
);

// File format with timestamps in syslog style
const fileFormat = winston.format.combine(
    overflowGuard(),
    winston.format.timestamp(),
    winston.format.printf((info: LogInfo) => {
        const ts = info.timestamp || new Date().toISOString();
        const zone = info.zone ?? 'core';
        const level = ((info.level as string) ?? '').toUpperCase();
        
        let dataPart = '';
        if (info.__serializedData !== undefined) {
            dataPart = ' ' + info.__serializedData;
        } else if (Object.prototype.hasOwnProperty.call(info, 'data')) {
            try {
                dataPart = ' ' + (typeof info.data === 'string' ? info.data : JSON.stringify(info.data));
            } catch {
                dataPart = ' ' + String(info.data);
            }
        }

        return `${ts} ${zone} ${level}: ${info.message}${dataPart}`;
    })
);

// Suppress console output during tests
const isTestEnv = process.env.NODE_ENV === 'test';

export const baseLogger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.Console({ format: consoleFormat, silent: isTestEnv }),
        new winston.transports.File({ filename: LOG_FILE, format: fileFormat })
    ]
});