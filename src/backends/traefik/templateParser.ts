import yaml from 'js-yaml';
import { XMagicProxyData } from '../../types/xmagic';
import { zone } from '../../logging/zone';
import { getErrorMessage } from './helpers';

const log = zone('backends.traefik.template');

/** Pattern for template variables: {{ variable_name }} or {{ object.property }} */
const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

/** Pattern for valid userData key names (alphanumeric and underscores only, no dots) */
const VALID_KEY_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Build the context object from app name and proxy data.
 * Core keys (app_name, hostname, target_url) cannot be overwritten by userData.
 * Supports both:
 * - Flat keys: {{ port }} (for backward compatibility)
 * - Nested access: {{ userData.port }} (explicit namespace)
 */
type Context = {
    app_name: string;
    hostname: string;
    target_url: string;
    userData: Record<string, string>;
    [key: string]: string | Record<string, string>;
};

function buildContext(appName: string, data: XMagicProxyData): Context {
    const CORE_KEYS = new Set(['app_name', 'hostname', 'target_url', 'userData']);
    
    const context: Context = {
        app_name: appName,
        hostname: data.hostname,
        target_url: data.target,
        userData: {},
    };

    // Merge user-supplied data into both flat context and userData namespace
    // Skip keys that match core variables to prevent overwrites
    if (data.userData && typeof data.userData === 'object') {
        for (const [key, value] of Object.entries(data.userData)) {
            if (VALID_KEY_PATTERN.test(key) && !CORE_KEYS.has(key)) {
                const stringValue = value == null ? '' : String(value);
                // Add to both flat keys ({{ port }}) and nested namespace ({{ userData.port }})
                context[key] = stringValue;
                context.userData[key] = stringValue;
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
 * @returns The rendered template as a string (for testing) or use renderTemplateParsed for parsed object
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

    /**
     * Get a value from context, supporting nested property access with dot notation.
     * e.g., "userData.foo" returns context.userData.foo
     */
    function getContextValue(path: string): string | undefined {
        const parts = path.split('.');
        let value: unknown = context;

        for (const part of parts) {
            if (value == null || typeof value !== 'object') {
                return undefined;
            }
            value = (value as Record<string, unknown>)[part];
        }

        return typeof value === 'string' ? value : undefined;
    }

    // Replace all {{ key }} occurrences
    const rendered = template.replace(VARIABLE_PATTERN, (_match, key: string) => {
        const value = getContextValue(key);
        if (value !== undefined) {
            return value;
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

    return rendered;
}

/** Result from rendering a template with both raw string and parsed object */
export type RenderResult<T> = {
    raw: string;
    parsed: T;
};

/**
 * Render a template and parse it as YAML.
 * Returns both the raw rendered string and the parsed object.
 * 
 * @param template - The template content with {{ variable }} placeholders
 * @param appName - The application name
 * @param data - The proxy configuration data
 * @returns Object containing both raw string and parsed YAML
 * @throws Error if unknown template variables are encountered or YAML is invalid
 */
export function renderTemplateParsed<T = unknown>(template: string, appName: string, data: XMagicProxyData): RenderResult<T> {
    const raw = renderTemplate(template, appName, data);
    
    try {
        const parsed = yaml.load(raw) as T;
        return { raw, parsed };
    } catch (err) {
        const message = getErrorMessage(err);
        log.error({
            message: 'Template produced invalid YAML',
            data: { appName, error: message }
        });
        throw new Error(`Template produced invalid YAML: ${message}`);
    }
}
