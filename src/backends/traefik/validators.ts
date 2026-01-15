import yaml from 'js-yaml';
import { getErrorMessage } from './helpers';

/** Allowed top-level keys in Traefik dynamic config */
const ALLOWED_TOP_KEYS = new Set(['http', 'tcp', 'udp']);

/** Allowed keys under http section */
const ALLOWED_HTTP_KEYS = new Set(['routers', 'services', 'middlewares']);

/** Allowed keys under tcp section */
const ALLOWED_TCP_KEYS = new Set(['routers', 'services']);

/** Allowed keys under udp section */
const ALLOWED_UDP_KEYS = new Set(['services']);

/** Pattern for invalid name characters */
const INVALID_NAME_PATTERN = /\s|\n/;

export type ValidationResult =
    | { valid: true }
    | { valid: false; error: string };

/**
 * Validate that all keys in a section have valid names.
 */
function validateSectionNames(section: unknown, path: string): string | null {
    if (!section || typeof section !== 'object') return null;

    for (const name of Object.keys(section)) {
        if (INVALID_NAME_PATTERN.test(name) || name.length === 0) {
            return `Invalid name in ${path}: '${name}'`;
        }
    }
    return null;
}

/**
 * Validate a config section has only allowed keys.
 */
function validateSectionKeys(
    section: Record<string, unknown>,
    allowedKeys: Set<string>,
    sectionName: string
): string | null {
    for (const key of Object.keys(section)) {
        if (!allowedKeys.has(key)) {
            return `Unexpected key under ${sectionName}: '${key}'`;
        }
    }
    return null;
}

/**
 * Validate generated Traefik configuration YAML.
 * Returns validation result. Since renderTemplate now throws on unknown variables,
 * no unreplaced template variables should ever reach this validator.
 */
export function validateGeneratedConfig(yamlText: string): ValidationResult {
    // Parse YAML
    let parsed: unknown;
    try {
        parsed = yaml.load(yamlText);
    } catch (err) {
        return { valid: false, error: `Invalid YAML: ${getErrorMessage(err)}` };
    }

    // Allow empty config
    if (!parsed) {
        return { valid: true };
    }

    if (typeof parsed !== 'object') {
        return { valid: false, error: 'Generated YAML is not a valid object' };
    }

    const config = parsed as Record<string, unknown>;

    // Validate top-level keys
    for (const key of Object.keys(config)) {
        if (!ALLOWED_TOP_KEYS.has(key)) {
            return { valid: false, error: `Unexpected top-level key: '${key}'` };
        }
    }

    // Validate http section
    if (config.http) {
        const http = config.http as Record<string, unknown>;
        const keyError = validateSectionKeys(http, ALLOWED_HTTP_KEYS, 'http');
        if (keyError) return { valid: false, error: keyError };

        for (const section of ['routers', 'services', 'middlewares']) {
            const nameError = validateSectionNames(http[section], `http.${section}`);
            if (nameError) return { valid: false, error: nameError };
        }
    }

    // Validate tcp section
    if (config.tcp) {
        const tcp = config.tcp as Record<string, unknown>;
        const keyError = validateSectionKeys(tcp, ALLOWED_TCP_KEYS, 'tcp');
        if (keyError) return { valid: false, error: keyError };

        for (const section of ['routers', 'services']) {
            const nameError = validateSectionNames(tcp[section], `tcp.${section}`);
            if (nameError) return { valid: false, error: nameError };
        }
    }

    // Validate udp section
    if (config.udp) {
        const udp = config.udp as Record<string, unknown>;
        const keyError = validateSectionKeys(udp, ALLOWED_UDP_KEYS, 'udp');
        if (keyError) return { valid: false, error: keyError };

        const nameError = validateSectionNames(udp.services, 'udp.services');
        if (nameError) return { valid: false, error: nameError };
    }

    return { valid: true };
}