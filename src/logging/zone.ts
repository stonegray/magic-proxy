import { baseLogger } from "./logger"

/* Usage:
 * const log = zone("auth.bar.foo");
 * log.info({ message: "User logged in", data: { userId: 12345 } });
 */

export function zone(name: string) {
    type LogPayload = {
        message: string;
        data?: unknown;
        /** When true, data will be replaced with "<private>" */
        private?: boolean;
    };

    function createLogFn(level: 'error' | 'warn' | 'info' | 'debug') {
        return (payload: string | LogPayload) => {
            if (typeof payload === 'string') {
                (baseLogger as any)[level](payload, { zone: name });
                return;
            }

            const { message, data, private: isPrivate } = payload;
            const emittedData = isPrivate ? '<private>' : data;

            (baseLogger as any)[level](message, { zone: name, data: emittedData });
        };
    }

    return {
        error: createLogFn('error'),
        warn: createLogFn('warn'),
        info: createLogFn('info'),
        debug: createLogFn('debug'),
        log: () => {
            //eslint allow console.log usage
            // eslint-disable-next-line no-console
            console.error("log() is not supported; use info(), debug(), warn(), or error() instead.");
            process.exit(1);
        }
    };
}