import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { XMagicProxyData } from '../../types/xmagic';

// Simple template rendering using {{ var }} placeholders.
// It safely replaces keys from the provided context object.
export function renderTemplate(template: string, appName: string, data: XMagicProxyData): string {
    const context: Record<string, string> = {
        app_name: appName,
        hostname: data.hostname,
        target_url: data.target,
    };

    // Merge user-supplied userdata keys into the rendering context (if present).
    // Do not overwrite core keys (app_name, hostname, target_url).
    if (data.userData && typeof data.userData === 'object') {
        for (const [k, v] of Object.entries(data.userData)) {
            if (/^[a-zA-Z0-9_]+$/.test(k) && context[k] === undefined) {
                context[k] = v === undefined || v === null ? '' : String(v);
            }
        }
    }

    // Basic replacement: replace all {{ key }} occurrences with string values.
    const out = template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
        if (Object.prototype.hasOwnProperty.call(context, key)) {
            return context[key] ?? '';
        }
        // If unknown key, leave it as-is to avoid accidental data loss
        return `{{ ${key} }}`;
    });

    // Validate that the filled template is valid YAML by parsing and dumping it back.
    try {
        const parsed = yaml.load(out);
        // Re-dump with consistent formatting
        return yaml.dump(parsed, { noRefs: true, skipInvalid: true });
    } catch {
        // If it's not valid YAML, just return the raw filled template (caller can decide)
        return out;
    }
}

// Convenience function to load a template file and render it
export async function renderTemplateFromFile(templatePath: string, appName: string, data: XMagicProxyData): Promise<string> {
    const content = await fs.promises.readFile(path.resolve(templatePath), 'utf-8');
    return renderTemplate(content, appName, data);
}

// Synchronous variant (useful for simple scripts)
export function renderTemplateFromFileSync(templatePath: string, appName: string, data: XMagicProxyData): string {
    const content = fs.readFileSync(path.resolve(templatePath), 'utf-8');
    return renderTemplate(content, appName, data);
}

// Example usage (for manual testing):
// import { renderTemplateFromFile } from './backends/templateParser';
// const tmpl = await renderTemplateFromFile('./config/template-example.yml', 'mysite', { target: 'http://10.0.0.1', hostname: 'example.com' });
// console.log(tmpl);
