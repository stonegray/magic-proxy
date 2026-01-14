import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { TraefikConfigYamlFormat } from './types/traefik';
import { validateGeneratedConfig } from './validators';
import { detectCollisions } from './helpers';
import { zone } from '../../logging/zone';

const log = zone('backends.traefik.manager');

// Registry of app configs keyed by app name
const registry = new Map<string, TraefikConfigYamlFormat>();
let outputFile: string | null = null;

// Track whether temp file cleanup has been performed for current output file
let tempFilesCleanedUp = false;

// Pending flush state for debouncing multiple rapid flushToDisk() calls
let pendingFlush: {
    resolvers: Array<{ resolve: () => void; reject: (err: Error) => void }>;
    scheduled: boolean;
} | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Config Building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge two records, with source values overwriting target values.
 * Logs a warning if any keys would be overwritten.
 */
function mergeRecord<T>(target: Record<string, T> = {}, source: Record<string, T> = {}, section?: string): Record<string, T> {
    if (section) {
        const collisions = detectCollisions(target, source);
        if (collisions.length > 0) {
            log.warn({
                message: 'Config name collision detected - values will be overwritten',
                data: { section, collisions }
            });
        }
    }
    return { ...target, ...source };
}

/**
 * Combine all registered partial configs into a single Traefik dynamic config.
 */
function buildCombinedConfig(): TraefikConfigYamlFormat {
    const combined: TraefikConfigYamlFormat = {};

    for (const cfg of registry.values()) {
        // HTTP section
        if (cfg.http?.routers || cfg.http?.services || cfg.http?.middlewares) {
            combined.http ??= {};
            combined.http.routers = mergeRecord(combined.http.routers, cfg.http.routers, 'http.routers');
            combined.http.services = mergeRecord(combined.http.services, cfg.http.services, 'http.services');
            combined.http.middlewares = mergeRecord(combined.http.middlewares, cfg.http.middlewares, 'http.middlewares');
        }

        // TCP section
        if (cfg.tcp?.routers || cfg.tcp?.services) {
            combined.tcp ??= {};
            combined.tcp.routers = mergeRecord(combined.tcp.routers, cfg.tcp.routers, 'tcp.routers');
            combined.tcp.services = mergeRecord(combined.tcp.services, cfg.tcp.services, 'tcp.services');
        }

        // UDP section
        if (cfg.udp?.services) {
            combined.udp ??= {};
            combined.udp.services = mergeRecord(combined.udp.services, cfg.udp.services, 'udp.services');
        }
    }

    return combined;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clean up stale .tmp files for a given target file.
 */
async function cleanupTempFiles(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath);
    
    try {
        const files = await fs.readdir(dir);
        const tmpFiles = files.filter(f => f.startsWith(baseName) && f.endsWith('.tmp'));
        
        await Promise.all(
            tmpFiles.map(tmpFile => 
                fs.unlink(path.join(dir, tmpFile)).catch(() => { })
            )
        );
        
        if (tmpFiles.length > 0) {
            log.debug({ message: 'Cleaned up temp files', data: { count: tmpFiles.length } });
        }
    } catch (err) {
        // Ignore errors from directory read (e.g., directory doesn't exist yet)
        log.debug({ message: 'Could not clean temp files', data: { error: err } });
    }
}

/**
 * Write YAML atomically using temp file + rename pattern.
 */
async function writeAtomically(filePath: string, content: string): Promise<void> {
    const tmpFile = `${filePath}.${process.pid}-${Date.now()}.tmp`;

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        // Clean up any stale temp files on first write only
        if (!tempFilesCleanedUp) {
            await cleanupTempFiles(filePath);
            tempFilesCleanedUp = true;
        }
        await fs.writeFile(tmpFile, content, 'utf-8');
        await fs.rename(tmpFile, filePath);
        log.debug({ message: 'Config written', data: { filePath } });
    } catch (err) {
        // Clean up temp file on failure
        await fs.unlink(tmpFile).catch(() => { });
        throw err;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function setOutputFile(file: string | null): void {
    if (file !== outputFile) {
        tempFilesCleanedUp = false; // Reset cleanup flag for new file
    }
    outputFile = file;
}

export function getOutputFile(): string | null {
    return outputFile;
}

/**
 * Flush the current combined configuration to disk.
 *
 * This function is debounced using setImmediate to prevent race conditions
 * when multiple containers are registered in rapid succession. All synchronous
 * register() calls will complete before the actual write occurs, ensuring the
 * file contains the complete configuration.
 */
export function flushToDisk(): Promise<void> {
    return new Promise((resolve, reject) => {
        // Add this caller to the list of resolvers
        if (!pendingFlush) {
            pendingFlush = { resolvers: [], scheduled: false };
        }
        pendingFlush.resolvers.push({ resolve, reject });

        // Schedule the actual flush if not already scheduled
        if (!pendingFlush.scheduled) {
            pendingFlush.scheduled = true;

            // Use setImmediate to defer the write until after all synchronous
            // register() calls have completed in the current event loop tick
            setImmediate(() => {
                executeFlush();
            });
        }
    });
}

/**
 * Execute the actual flush operation and resolve/reject all pending callers.
 */
async function executeFlush(): Promise<void> {
    const flush = pendingFlush;
    pendingFlush = null;

    if (!flush) return;

    try {
        await doFlushToDisk();
        flush.resolvers.forEach(r => r.resolve());
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        flush.resolvers.forEach(r => r.reject(error));
    }
}

/**
 * Internal implementation of flush - writes the current combined config to disk.
 */
async function doFlushToDisk(): Promise<void> {
    if (!outputFile) {
        log.debug({ message: 'No output file configured, skipping flush' });
        return;
    }

    const combined = buildCombinedConfig();
    const yamlText = yaml.dump(combined, { noRefs: true, skipInvalid: true });

    // Validate before writing
    const validation = validateGeneratedConfig(yamlText);
    if (!validation.valid) {
        log.error({ message: 'Generated config validation failed', data: { error: validation.error } });
        throw new Error(`Invalid config generated: ${validation.error}`);
    }

    await writeAtomically(outputFile, yamlText);
}

/**
 * Register or update an app's configuration.
 * Performs deep merge of routers, services, and middlewares.
 */
export function register(appName: string, config: Partial<TraefikConfigYamlFormat>): void {
    const existing = registry.get(appName) ?? {};

    // Deep merge each section to preserve existing routers/services/middlewares
    const merged: TraefikConfigYamlFormat = {
        http: (existing.http || config.http) ? {
            routers: { ...existing.http?.routers, ...config.http?.routers },
            services: { ...existing.http?.services, ...config.http?.services },
            middlewares: { ...existing.http?.middlewares, ...config.http?.middlewares },
        } : undefined,
        tcp: (existing.tcp || config.tcp) ? {
            routers: { ...existing.tcp?.routers, ...config.tcp?.routers },
            services: { ...existing.tcp?.services, ...config.tcp?.services },
        } : undefined,
        udp: (existing.udp || config.udp) ? {
            services: { ...existing.udp?.services, ...config.udp?.services },
        } : undefined,
    };

    registry.set(appName, merged);
    log.debug({ message: 'App registered', data: { appName } });
}

/**
 * Remove an app's configuration.
 */
export function remove(appName: string): void {
    const existed = registry.delete(appName);
    if (existed) {
        log.debug({ message: 'App removed', data: { appName } });
    }
}

/**
 * Get the combined YAML configuration as a string.
 */
export function getConfig(): string {
    return yaml.dump(buildCombinedConfig(), { noRefs: true, skipInvalid: true });
}

/**
 * List all registered app names.
 */
export function listRegisteredApps(): string[] {
    return Array.from(registry.keys());
}

/**
 * Reset state for testing.
 */
export function _resetForTesting(): void {
    registry.clear();
    outputFile = null;
    pendingFlush = null;
    tempFilesCleanedUp = false;
}
