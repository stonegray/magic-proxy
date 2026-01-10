import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { OUTPUT_DIRECTORY, CONFIG_DIRECTORY } from '../../config';
import { renderTemplate } from './templateParser';
import { TraefikConfigYamlFormat } from './types/traefik';
import * as manager from './traefikManager';
import { MagicProxyConfigFile } from '../../types/config';
import { XMagicProxyData } from '../../types/xmagic';
import { HostEntry } from '../../types/host';

let templates: Map<string, string> = new Map(); // Map template name to template content
// registry moved to traefikManager (manager.register/remove/getConfig/listRegisteredApps)

let _lastRendered: string | null = null;
let _lastUserData: string | null = null;

// Load a template from file, resolving relative paths against CONFIG_DIRECTORY
async function loadTemplate(templatePath: string): Promise<string> {
    const resolved = path.isAbsolute(templatePath)
        ? templatePath
        : path.resolve(CONFIG_DIRECTORY, templatePath);

    try {
        const content = await fs.promises.readFile(resolved, 'utf-8');
        return content;
    } catch (error) {
        const errorMsg = `ERROR: Failed to load template ${templatePath} (resolved: ${resolved}): ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
}

// Creates a Traefik config fragment by rendering the appropriate template with app data
function makeAppConfig(appName: string, data: XMagicProxyData): TraefikConfigYamlFormat {
    _lastUserData = data.userData ? JSON.stringify(data.userData) : null;

    // Get the template to use from templates map
    const templateContent = templates.get(data.template);
    if (templateContent === undefined) {
        const errorMsg = `ERROR: Template '${data.template}' not found for app '${appName}'. Available templates: ${Array.from(templates.keys()).join(', ')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    const rendered = renderTemplate(templateContent, appName, data);
    _lastRendered = rendered;
    const parsed = yaml.load(rendered) as TraefikConfigYamlFormat;
    return parsed;
}

// For tests: inspect last rendered template and userdata
export function _getLastRendered(): string | null { return _lastRendered; }
export function _getLastUserData(): string | null { return _lastUserData; }

// For testing: set a template directly (bypassing file loading)
export function _setTemplateForTesting(name: string, content: string): void {
    templates.set(name, content);
}

// For testing: clear registry
export function _resetForTesting(): void {
    if (typeof manager._resetForTesting === 'function') manager._resetForTesting();
    templates.clear();
}



export async function initialize(config?: MagicProxyConfigFile): Promise<void> {
    if (!config) {
        const errorMsg = 'ERROR: No config provided to traefik backend initialize';
        console.error(errorMsg);
        process.exit(1);
    }

    // Load templates from config
    if (!config.traefik?.templates || config.traefik.templates.length === 0) {
        const errorMsg = 'ERROR: No templates defined in config.traefik.templates. At least one template is required.';
        console.error(errorMsg);
        process.exit(1);
    }

    for (const templatePath of config.traefik.templates) {
        const templateName = path.basename(templatePath);
        const content = await loadTemplate(templatePath);
        templates.set(templateName, content);
    }

    if (templates.size === 0) {
        const errorMsg = 'ERROR: No templates were loaded. Cannot proceed without templates.';
        console.error(errorMsg);
        process.exit(1);
    }

    if (config.traefik && config.traefik.outputFile) {
        // If output file is relative, write into OUTPUT_DIRECTORY by default
        const of = config.traefik.outputFile;
        const resolved = of && (of.startsWith('/') ? of : path.resolve(OUTPUT_DIRECTORY, of));
        manager.setOutputFile(resolved || null);
    }
    // on initialize, flush current registry (may be empty)
    await manager.flushToDisk();
}

export async function addProxiedApp(entry: HostEntry): Promise<void> {
    const appName = entry.containerName;
    const data = entry.xMagicProxy;
    const cfg = makeAppConfig(appName, data);
    manager.register(appName, cfg);
    await manager.flushToDisk();
}

export async function removeProxiedApp(appName: string): Promise<void> {
    manager.remove(appName);
    await manager.flushToDisk();
}

export async function getConfig(): Promise<string> {
    return manager.getConfig();
}

export async function getStatus(): Promise<{
  registered: string[];
  outputFile?: string | null;
}> {
  return {
      registered: manager.listRegisteredApps(),
      outputFile: manager.getOutputFile(),
  };
}
