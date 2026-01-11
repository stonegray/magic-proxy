import * as winston from "winston";
import fs from 'fs';
import path from 'path';
import util from 'util';

export const OVERSIZE_THRESHOLD = 100_000; // bytes
export const CONSOLE_TRUNCATE_LENGTH = 1_000; // characters
const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'app.log');

// Define colors for levels and add them to winston
const levelColors: Record<string, string> = {
    info: 'cyan',   // light blue
    debug: 'gray',  // gray
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
    // If we can't make the dir, continue; file transport will error when used
    // We don't want to crash the app during logger initialization
    console.error('[Logger] Failed to ensure log directory exists:', err);
}

// Type-aware serialization for log data. Exported for testing and extension.
export function serializeLogData(data: unknown): string {
    // Strings are returned as-is
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
        const fn = data as (...args: unknown[]) => unknown;
        return `<function:${fn.name || 'anonymous'}>`;
    }

    if (Buffer.isBuffer(data)) {
        // Use base64 to safely serialize binary data without huge expansion
        return `<Buffer base64:${(data as Buffer).toString('base64')}>`;
    }

    // Objects: try JSON.stringify, fallback to util.inspect for circular references
    try {
        return JSON.stringify(data);
    } catch {
    // Fallback to util.inspect for objects that can't be JSON-stringified
        return util.inspect(data, { depth: 2, breakLength: Infinity });
    }
}

import type { Logform } from 'winston';

type LogInfo = Logform.TransformableInfo & { __serializedData?: string; zone?: string; data?: unknown; timestamp?: string };

// Guard that checks incoming data size and replaces oversized payloads
export const overflowGuard = winston.format((info: LogInfo) => {
    // If data is not present at all, or explicitly undefined, treat it as missing and do nothing
    if (!Object.prototype.hasOwnProperty.call(info, 'data') || info.data === undefined) {
        return info;
    }

    // Serialize using type-aware serializer to avoid undefined/non-serializable issues
    let serialized: string;
    try {
        serialized = serializeLogData(info.data as unknown);
    } catch (err) {
        const stack = err instanceof Error && err.stack ? err.stack : String(err);
        info.zone = 'logger';
        info.message = 'an oversized/invalid log message was received.';
        info.data = { stack, bytes: 0 };
        info.level = 'error';
        return info;
    }

    // Attach serialized copy for formatters and debugging without mutating original data
    info.__serializedData = serialized;

    const bytes = Buffer.byteLength(serialized, 'utf8');

    if (bytes > OVERSIZE_THRESHOLD) {
        // Throw and capture stack for context, then replace message/meta
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

export function formatDataForConsole(data: unknown) {
    if (data === undefined) return '';

    let s: string;
    try {
        s = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    } catch {
        s = String(data);
    }

    const bytes = Buffer.byteLength(s, 'utf8');
    if (s.length > CONSOLE_TRUNCATE_LENGTH) {
        return s.slice(0, CONSOLE_TRUNCATE_LENGTH) + ` ... <truncated ${bytes} bytes>`;
    }

    return s;
}

export const lowerCaseLevel = winston.format((info) => {
    if (info.level) info.level = String(info.level).toLowerCase();
    return info;
});

export const consoleFormat = winston.format.combine(
    overflowGuard(),
    lowerCaseLevel(),
    winston.format.colorize({ all: false }),
    winston.format.printf((info: LogInfo) => {
        const levelLabel = (info.level as string) ?? '';
        const zone = info.zone ?? 'core';
        // Prefer serialized data for consistent, safe output
        const dataSource = typeof info.__serializedData !== 'undefined' ? info.__serializedData : (Object.prototype.hasOwnProperty.call(info, 'data') ? info.data : undefined);
        const dataPart = typeof dataSource !== 'undefined' ? ' ' + formatDataForConsole(dataSource) : '';
        return `[${levelLabel}][${zone}] ${info.message}${dataPart}`;
    })
);

const fileFormat = winston.format.combine(
    overflowGuard(),
    winston.format.timestamp(),
    winston.format.printf((info: LogInfo) => {
        const ts = info.timestamp || new Date().toISOString();
        const zone = info.zone ?? 'core';
        const level = ((info.level as string) ?? '').toUpperCase();
        let dataPart = '';
        const serialized = info.__serializedData;
        if (typeof serialized !== 'undefined') {
            dataPart = ' ' + serialized;
        } else if (Object.prototype.hasOwnProperty.call(info, 'data')) {
            try {
                dataPart = ' ' + (typeof info.data === 'string' ? info.data : JSON.stringify(info.data));
            } catch {
                dataPart = ' ' + String(info.data);
            }
        }

        // Simple syslog-like line: TIMESTAMP ZONE LEVEL: MESSAGE DATA
        return `${ts} ${zone} ${level}: ${info.message}${dataPart}`;
    })
);

// When running unit tests we should avoid printing logs to console
const isTestEnv = process.env.NODE_ENV === 'test';

export const baseLogger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.Console({ format: consoleFormat, silent: isTestEnv }),
        new winston.transports.File({ filename: LOG_FILE, format: fileFormat })
    ]
});