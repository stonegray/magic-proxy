import isDocker from "is-docker";


// set config direcotry to CONFIG_DIRECOTRY env or default to ./config:

export const CONFIG_DIRECTORY = process.env.CONFIG_DIRECTORY || (isDocker() ? '/var/config/' : './config/');

// set output directory to CONFIG_DIRECOTRY env or default to ./generated:

export const OUTPUT_DIRECTORY = process.env.OUTPUT_DIRECTORY || (isDocker() ? '/var/generated/' : './generated/');


export const DEFAULT_CONFIG_FILE = CONFIG_DIRECTORY + 'magic-proxy.yml';

// Read the config file and load the YAML:
import fs from 'fs';
import yaml from 'js-yaml';
import { MagicProxyConfigFile } from './types/config';

export async function loadConfigFile(path: string = DEFAULT_CONFIG_FILE): Promise<MagicProxyConfigFile> {
    try {
        const fileContent = await fs.promises.readFile(path, 'utf-8');
        const config = yaml.load(fileContent) as MagicProxyConfigFile;

        // validateConfig throws if invalid:
        validateConfig(config);

        return config;
    } catch (error) {
        throw new Error(`Error loading config file at ${path}: ${error instanceof Error ? error.message : String(error)}`);
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



(async () => {
    console.log(await loadConfigFile());

})();