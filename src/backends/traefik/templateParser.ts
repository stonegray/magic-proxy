import yaml from 'js-yaml';
import { XMagicProxyData } from '../../types/xmagic';
import { zone } from '../../logging/zone';

const log = zone('backends.traefik.template');

/** Pattern for template variables: {{ variable_name }} */
const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

/** Pattern for valid variable names */
const VALID_KEY_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Build the context object from app name and proxy data.
 * Core keys (app_name, hostname, target_url) cannot be overwritten by userData.
 */
function buildContext(appName: string, data: XMagicProxyData): Record<string, string> {
    const context: Record<string, string> = {
        app_name: appName,
        hostname: data.hostname,
        target_url: data.target,
    };

    // Merge user-supplied data (skip invalid keys and reserved names)
    if (data.userData && typeof data.userData === 'object') {
        for (const [key, value] of Object.entries(data.userData)) {
            if (VALID_KEY_PATTERN.test(key) && !(key in context)) {
                context[key] = value == null ? '' : String(value);
            }
        }
    }

    return context;
}

/**
 * Render a template string by replacing {{ variable }} placeholders.
 * 
 * Throws an error if any template variables cannot be resolved.
 * 
 * @param template - The template content with {{ variable }} placeholders
 * @param appName - The application name
 * @param data - The proxy configuration data
 * @returns The rendered template as normalized YAML
 * @throws Error if unknown template variables are encountered
 */
export function renderTemplate(template: string, appName: string, data: XMagicProxyData): string {
    const context = buildContext(appName, data);

    log.debug({
        message: 'Rendering template',
        data: { appName, context: { app_name: context.app_name, hostname: context.hostname, target_url: context.target_url } }
    });

    // Track unknown variables
    const unknownVariables: string[] = [];

    // Replace all {{ key }} occurrences
    const rendered = template.replace(VARIABLE_PATTERN, (_match, key: string) => {
        if (key in context) {
            return context[key];
        }
        // Track unknown variable for error reporting
        unknownVariables.push(key);
        return _match; // Return original text
    });

    // If there were unknown variables, throw an error
    if (unknownVariables.length > 0) {
        const uniqueVars = [...new Set(unknownVariables)];
        const message = `Template contains unknown variables: ${uniqueVars.join(', ')}`;
        log.error({ message, data: { appName, unknownVariables: uniqueVars } });
        throw new Error(message);
    }

    // Parse and re-dump for consistent YAML formatting
    try {
        const parsed = yaml.load(rendered);
        return yaml.dump(parsed, { noRefs: true, skipInvalid: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({
            message: 'Template produced invalid YAML',
            data: { appName, error: message }
        });
        throw new Error(`Template produced invalid YAML: ${message}`);
    }
}
