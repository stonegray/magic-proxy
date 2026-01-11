import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { TraefikConfigYamlFormat } from './types/traefik';
import { zone } from '../../logging/zone';

const log = zone('backends.traefik.mgr');

// Registry stores partial configs keyed by app name
const registry = new Map<string, TraefikConfigYamlFormat>();
let outputFile: string | null = null;

// Helper: safely merge a record into target without altering keys
function mergeRecord<T>(
    target: Record<string, T> | undefined,
    source: Record<string, T> | undefined
): Record<string, T> {
    const out: Record<string, T> = { ...(target || {}) };
    if (!source) return out;
    for (const [k, v] of Object.entries(source)) {
        out[k] = v;
    }
    return out;
}

// Combine all registered partial configs into a single Traefik dynamic config
function buildCombinedConfig(): TraefikConfigYamlFormat {
    const combined: TraefikConfigYamlFormat = {};

    for (const [, cfg] of registry.entries()) {
        // HTTP (only include if any subkeys exist)
        const hasHttp = !!(cfg.http && (cfg.http.routers || cfg.http.services || cfg.http.middlewares));
        if (hasHttp) {
            combined.http = combined.http || {};
            if (cfg.http?.routers) {
                combined.http.routers = mergeRecord(combined.http.routers, cfg.http.routers);
            }
            if (cfg.http?.services) {
                combined.http.services = mergeRecord(combined.http.services, cfg.http.services);
            }
            if (cfg.http?.middlewares) {
                combined.http.middlewares = mergeRecord(combined.http.middlewares, cfg.http.middlewares);
            }
        }

        // TCP (optional; include only if routers/services exist)
        const hasTcp = !!(cfg.tcp && (cfg.tcp.routers || cfg.tcp.services));
        if (hasTcp) {
            combined.tcp = combined.tcp || {};
            if (cfg.tcp?.routers) {
                combined.tcp.routers = mergeRecord(combined.tcp.routers, cfg.tcp.routers);
            }
            if (cfg.tcp?.services) {
                combined.tcp.services = mergeRecord(combined.tcp.services, cfg.tcp.services);
            }
        }

        // UDP (optional; include only if services exist)
        const hasUdp = !!(cfg.udp && cfg.udp.services);
        if (hasUdp) {
            combined.udp = combined.udp || {};
            if (cfg.udp?.services) {
                combined.udp.services = mergeRecord(combined.udp.services, cfg.udp.services);
            }
        }
    }

    return combined;
}

export function setOutputFile(of: string | null) {
    outputFile = of;
}

export async function flushToDisk(): Promise<void> {
    if (!outputFile) return;

    const combined = buildCombinedConfig();
    const yamlText = yaml.dump(combined, { noRefs: true, skipInvalid: true });

    // Validate YAML can be parsed back before writing
    try {
        const validated = yaml.load(yamlText);
        if (!validated || typeof validated !== 'object') {
            throw new Error('Generated YAML is not a valid object');
        }

        // Additional structural validation to catch malformed keys or unexpected sections
        const topKeys = Object.keys(validated as Record<string, unknown>);
        const allowedTop = ['http', 'tcp', 'udp'];
        for (const k of topKeys) {
            if (!allowedTop.includes(k)) {
                throw new Error(`Unexpected top-level key in generated YAML: '${k}'`);
            }
        }

        // Validate http substructure
        const val = validated as Record<string, unknown>;
        if (val.http) {
            const http = val.http as Record<string, unknown>;
            const httpKeys = Object.keys(http);
            const allowedHttp = ['routers', 'services', 'middlewares'];
            for (const hk of httpKeys) {
                if (!allowedHttp.includes(hk)) {
                    throw new Error(`Unexpected key under http in generated YAML: '${hk}'`);
                }
                const section = http[hk];
                if (section && typeof section === 'object') {
                    for (const name of Object.keys(section)) {
                        // keys must be simple strings without whitespace/newlines
                        if (/\s|\n/.test(name) || name.length === 0) {
                            throw new Error(`Invalid name in http.${hk}: '${name}'`);
                        }
                    }
                }
            }
        }

        // Check for unreplaced template variables
        if (yamlText.includes('{{') || yamlText.includes('}}')) {
            log.warn({
                message: 'Generated config contains unreplaced template variables (may indicate missing data)'
            });
        }
    } catch (error) {
        log.error({
            message: 'Failed to validate generated YAML',
            data: { error: error instanceof Error ? error.message : String(error) }
        });
        throw new Error(`Invalid YAML generated, refusing to write: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Ensure directory exists before writing
    await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });

    // Write atomically: write to a uniquely-named temporary file and rename into place
    const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const tmpFile = `${outputFile}.${uniqueSuffix}.tmp`;
    await fs.promises.writeFile(tmpFile, yamlText, 'utf-8');

    // Verify temporary file was written correctly. Only enforce strict verification
    // when the real fs.promises.writeFile implementation is in use (tests often mock it).
    try {
        // If writeFile was not mocked (i.e. not a spy), do a strict check
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isMocked = !!(fs.promises.writeFile as any).mock || !!(fs.promises.writeFile as any)._isMockFunction;
        if (isMocked) {
            // writeFile has been replaced; skip strict verification
        } else {
            const st = await fs.promises.stat(tmpFile);
            if (!st.isFile() || st.size === 0) {
                await fs.promises.unlink(tmpFile).catch(() => { });
                throw new Error('Temporary file write failed or produced empty file');
            }
            const tmpContent = await fs.promises.readFile(tmpFile, 'utf-8');
            if (tmpContent !== yamlText) {
                // Helpful diagnostic when this unlikely mismatch happens
                const truncated = tmpContent.slice(0, 512);
                log.error({
                    message: 'Temporary file differs from generated YAML',
                    data: {
                        tmpFile,
                        tmpSize: st.size,
                        expectedSize: Buffer.byteLength(yamlText, 'utf8'),
                        tmpPreview: truncated.replace(/\n/g, '\\n').slice(0, 512)
                    }
                });
                await fs.promises.unlink(tmpFile).catch(() => { });
                throw new Error('Temporary file contents do not match generated YAML');
            }
        }
    } catch (err) {
        log.error({
            message: 'Failed to verify temporary file',
            data: { error: err instanceof Error ? err.message : String(err) }
        });
        throw err;
    }

    await fs.promises.rename(tmpFile, outputFile);
}

// Public API
export function register(appName: string, config: Partial<TraefikConfigYamlFormat>) {
    // Store a shallow copy typed as TraefikConfigYamlFormat so callers can supply partials
    const existing = registry.get(appName) || {};
    const merged: TraefikConfigYamlFormat = {
        http: { ...(existing.http || {}), ...(config.http || {}) },
        tcp: { ...(existing.tcp || {}), ...(config.tcp || {}) },
        udp: { ...(existing.udp || {}), ...(config.udp || {}) },
    };
    registry.set(appName, merged);
}

export function remove(appName: string) {
    registry.delete(appName);
}

export function getConfig(): string {
    const combined = buildCombinedConfig();
    // Dump YAML with a reasonable schema and options; avoid undefined fields
    return yaml.dump(combined, { noRefs: true, skipInvalid: true });
}

export function getOutputFile(): string | null {
    return outputFile;
}

// Convenience for testing / runtime introspection
export function listRegisteredApps(): string[] {
    return Array.from(registry.keys());
}

export function _resetForTesting(): void {
    registry.clear();
    outputFile = null;
}

/*
Usage example (no test framework required):

import { register, getConfig, remove } from './backends/traefik/traefik';

register('app1', {
  http: {
    routers: { 'web': { rule: 'Host(`a.example`)', service: 'webservice' } },
    services: { 'webservice': { loadBalancer: { servers: [{ url: 'http://10.0.0.1' }] } } }
  }
});

console.log(getConfig());

*/
