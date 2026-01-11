import * as winston from "winston";
import fs from 'fs';
import path from 'path';

export const OVERSIZE_THRESHOLD = 100_000; // bytes
export const CONSOLE_TRUNCATE_LENGTH = 1_000; // characters
const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'app.log');

const levelMap: Record<string, string> = {
    error: "E",
    warn: "W",
    info: "I",
    debug: "D"
};

// Ensure log directory exists for file transport
try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (err) {
    // If we can't make the dir, continue; file transport will error when used
    // We don't want to crash the app during logger initialization
    // eslint-disable-next-line no-console
    console.error('[Logger] Failed to ensure log directory exists:', err);
}

// Guard that checks incoming data size and replaces oversized payloads
export const overflowGuard = winston.format((info) => {
    if (!Object.prototype.hasOwnProperty.call(info, 'data')) {
        return info;
    }

    // Compute byte length of the data representation
    let dataStr: string;
    try {
        dataStr = typeof info.data === 'string' ? info.data : JSON.stringify(info.data);
    } catch (err) {
        // If JSON.stringify fails, replace with a marker
        info.zone = 'logger';
        info.message = 'an oversized/invalid log message was recieved.';
        const stack = (err instanceof Error && err.stack) ? err.stack : String(err);
        info.data = { stack, bytes: 0 };
        info.level = 'error';
        return info;
    }

    const bytes = Buffer.byteLength(dataStr, 'utf8');

    if (bytes > OVERSIZE_THRESHOLD) {
        // Throw and capture stack for context, then replace message/meta
        try {
            throw new Error('Oversized log message');
        } catch (err) {
            const stack = err instanceof Error && err.stack ? err.stack : String(err);
            info.zone = 'logger';
            info.message = 'an oversized/invalid log message was recieved.';
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
    } catch (err) {
        s = String(data);
    }

    const bytes = Buffer.byteLength(s, 'utf8');
    if (s.length > CONSOLE_TRUNCATE_LENGTH) {
        return s.slice(0, CONSOLE_TRUNCATE_LENGTH) + ` ... <truncated ${bytes} bytes>`;
    }

    return s;
}

const consoleFormat = winston.format.combine(
    overflowGuard(),
    winston.format.colorize(),
    winston.format.printf(info => {
        const tag = levelMap[(info.level as string)] ?? (info.level as string).toUpperCase();
        const zone = info.zone ?? 'core';
        const dataPart = Object.prototype.hasOwnProperty.call(info, 'data') ? ' ' + formatDataForConsole((info as any).data) : '';
        return `[${tag}][${zone}] ${info.message}${dataPart}`;
    })
);

const fileFormat = winston.format.combine(
    overflowGuard(),
    winston.format.timestamp(),
    winston.format.printf(info => {
        const ts = (info as any).timestamp || new Date().toISOString();
        const zone = info.zone ?? 'core';
        const level = ((info.level as string) ?? '').toUpperCase();
        let dataPart = '';
        if (Object.prototype.hasOwnProperty.call(info, 'data')) {
            try {
                dataPart = ' ' + (typeof (info as any).data === 'string' ? (info as any).data : JSON.stringify((info as any).data));
            } catch (_) {
                dataPart = ' ' + String((info as any).data);
            }
        }

        // Simple syslog-like line: TIMESTAMP ZONE LEVEL: MESSAGE DATA
        return `${ts} ${zone} ${level}: ${info.message}${dataPart}`;
    })
);

export const baseLogger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new winston.transports.File({ filename: LOG_FILE, format: fileFormat })
    ]
});