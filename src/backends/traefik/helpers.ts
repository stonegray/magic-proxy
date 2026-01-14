/**
 * Small shared helpers for the Traefik backend.
 */

export function getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export function detectCollisions<T>(target: Record<string, T> = {}, source: Record<string, T> = {}): string[] {
    return Object.keys(source).filter(k => k in target);
}
