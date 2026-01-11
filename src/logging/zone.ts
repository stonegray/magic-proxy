import { baseLogger } from "./logger"

/* Usage:
 * const log = zone("auth.bar.foo");
 * log.info({ message: "User logged in", data: { userId: 12345 } });
 */

export type LogPayload = {
    message: string;
    data?: unknown;
    /** When true, data will be replaced with "<private>" */
    private?: boolean;
};

export function zone(name: string) {

    function createLogFn(level: 'error' | 'warn' | 'info' | 'debug') {
        return (payload: LogPayload) => {
            const { message, data, private: isPrivate } = payload;

            const meta: Record<string, unknown> = { zone: name };
            if (isPrivate) {
                meta.data = '<private>';
            } else if (data !== undefined) {
                meta.data = data;
            }

            (baseLogger as any)[level](message, meta);
        };
    }

    return {
        error: createLogFn('error'),
        warn: createLogFn('warn'),
        info: createLogFn('info'),
        debug: createLogFn('debug'),
    };
}