import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { OUTPUT_DIRECTORY, CONFIG_DIRECTORY } from '../../config';
import { renderTemplate } from './templateParser';
import { TraefikConfigYamlFormat } from './types/traefik';
import * as manager from './traefikManager';
import { MagicProxyConfigFile } from '../../types/config';
import { XMagicProxyData } from '../../types/xmagic';
import { HostEntry } from '../../types/host';
import { zone } from '../../logging/zone';

const log = zone('backends.traefik');

/** Template storage: maps template filename -> content */
const templates = new Map<string, string>();

/** Tracking for debugging */
let lastRendered: string | null = null;
let lastUserData: string | null = null;

/**
 * Load a template file from disk.
 * Relative paths are resolved against CONFIG_DIRECTORY.
 */
async function loadTemplate(templatePath: string): Promise<string> {
    const resolved = path.isAbsolute(templatePath)
        ? templatePath
        : path.resolve(CONFIG_DIRECTORY, templatePath);

    log.debug({ message: 'Loading template', data: { templatePath, resolved } });

    try {
        return await fs.readFile(resolved, 'utf-8');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ message: 'Failed to load template', data: { templatePath, resolved, error: message } });
        throw new Error(`Failed to load template '${templatePath}': ${message}`);
    }
}

/**
 * Creates a Traefik config fragment by rendering the appropriate template.
 * Returns null if template rendering fails.
 */
function makeAppConfig(appName: string, data: XMagicProxyData): TraefikConfigYamlFormat | null {
    lastUserData = data.userData ? JSON.stringify(data.userData) : null;

    const templateContent = templates.get(data.template);
    if (!templateContent) {
        const available = Array.from(templates.keys()).join(', ') || '(none)';
        log.error({ message: 'Template not found', data: { appName, template: data.template, available } });
        throw new Error(`Template '${data.template}' not found for app '${appName}'. Available: ${available}`);
    }

    log.debug({
        message: 'Rendering template',
        data: { appName, template: data.template, target: data.target, hostname: data.hostname }
    });

    try {
        const rendered = renderTemplate(templateContent, appName, data);
        lastRendered = rendered;
        return yaml.load(rendered) as TraefikConfigYamlFormat;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({
            message: 'Failed to render template',
            data: { appName, error: message }
        });
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test utilities
// ─────────────────────────────────────────────────────────────────────────────

export function _getLastRendered(): string | null {
    return lastRendered;
}

export function _getLastUserData(): string | null {
    return lastUserData;
}

export function _setTemplateForTesting(name: string, content: string): void {
    templates.set(name, content);
}

export function _resetForTesting(): void {
    manager._resetForTesting?.();
    templates.clear();
    lastRendered = null;
    lastUserData = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the Traefik backend with the given configuration.
 */
export async function initialize(config?: MagicProxyConfigFile): Promise<void> {
    if (!config) {
        throw new Error('Traefik backend requires a configuration object');
    }

    const templatePaths = config.traefik?.templates;
    if (!templatePaths?.length) {
        throw new Error('No templates defined in config.traefik.templates');
    }

    log.info({ message: 'Initializing Traefik backend', data: { templateCount: templatePaths.length } });
    
    // Load all templates concurrently
    const loadResults = await Promise.all(
        templatePaths.map(async (templatePath) => ({
            name: path.basename(templatePath),
            content: await loadTemplate(templatePath),
        }))
    );

    templates.clear();
    for (const { name, content } of loadResults) {
        templates.set(name, content);
        log.debug({ message: 'Template loaded', data: { name } });
    }

    if (templates.size === 0) {
        throw new Error('No templates were loaded');
    }

    // Configure output file
    const outputFile = config.traefik?.outputFile;
    if (outputFile) {
        const resolved = path.isAbsolute(outputFile)
            ? outputFile
            : path.resolve(OUTPUT_DIRECTORY, outputFile);
        manager.setOutputFile(resolved);
        log.info({ message: 'Output file configured', data: { outputFile: resolved } });
    }

    await manager.flushToDisk();
}

/**
 * Add or update a proxied application.
 * If template rendering fails, the host is skipped with an error log.
 */
export async function addProxiedApp(entry: HostEntry): Promise<void> {
    const { containerName, xMagicProxy } = entry;
    log.info({
        message: 'Adding proxied app',
        data: { containerName, hostname: xMagicProxy.hostname, target: xMagicProxy.target, template: xMagicProxy.template }
    });

    const config = makeAppConfig(containerName, xMagicProxy);
    if (config === null) {
        log.error({
            message: 'Skipping host due to template rendering failure',
            data: { containerName, hostname: xMagicProxy.hostname }
        });
        return;
    }

    manager.register(containerName, config);
    await manager.flushToDisk();
}

/**
 * Remove a proxied application.
 */
export async function removeProxiedApp(appName: string): Promise<void> {
    log.info({ message: 'Removing proxied app', data: { appName } });
    manager.remove(appName);
    await manager.flushToDisk();
}

/**
 * Get the current merged Traefik configuration as YAML.
 */
export async function getConfig(): Promise<string> {
    return manager.getConfig();
}

/**
 * Get the current backend status.
 */
export async function getStatus(): Promise<{ registered: string[]; outputFile: string | null }> {
    return {
        registered: manager.listRegisteredApps(),
        outputFile: manager.getOutputFile(),
    };
}
