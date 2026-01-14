import isDocker from "is-docker";

// Configuration directories - use environment variables or sensible defaults
export const CONFIG_DIRECTORY = process.env.CONFIG_DIRECTORY || (isDocker() ? '/var/config/' : './config/');
export const OUTPUT_DIRECTORY = process.env.OUTPUT_DIRECTORY || (isDocker() ? '/var/generated/' : './generated/');

/**
 * Get the default config file path.
 * Uses lazy evaluation to support FS mocking in tests.
 */
let _defaultConfigFile: string | null = null;
export function getDefaultConfigFile(): string {
    if (_defaultConfigFile === null) {
        _defaultConfigFile = CONFIG_DIRECTORY + 'magic-proxy.yml';
    }
    return _defaultConfigFile;
}

// For backwards compatibility - computed on first access
export const DEFAULT_CONFIG_FILE = getDefaultConfigFile();

// Read the config file and load the YAML:
import fs from 'fs';
import yaml from 'js-yaml';
import { MagicProxyConfigFile } from './types/config';

export async function loadConfigFile(path?: string): Promise<MagicProxyConfigFile> {
    const configPath = path || getDefaultConfigFile();
    try {
        const fileContent = await fs.promises.readFile(configPath, 'utf-8');
        const config = yaml.load(fileContent) as MagicProxyConfigFile;

        // validateConfig throws if invalid:
        validateConfig(config);

        return config;
    } catch (error) {
        throw new Error(`Error loading config file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// config validator:
export function validateConfig(config: MagicProxyConfigFile): boolean {
    const validBackends = ['traefik'];
    if (!config.proxyBackend || !validBackends.includes(config.proxyBackend)) {
        throw new Error(`Invalid proxyBackend in config file. Must be one of: ${validBackends.join(', ')}`);
    }
    return true;
}