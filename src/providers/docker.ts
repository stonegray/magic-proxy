import Docker from 'dockerode';
import { ComposeFileReference, ComposeFileData } from '../types/docker';
import fs from 'fs';
import yaml from 'js-yaml';
import { XMagicProxyData } from '../types/xmagic';
import { HostDB } from '../hostDb';
import { HostEntry } from '../types/host';

// Constants
const COMPOSE_CONFIG_LABEL = 'com.docker.compose.project.config_files';
const CONTAINER_NAME_PREFIX = /^\//;

// Return type for updateDatabaseFromManifest
export interface ProcessingResult {
    [composeFilePath: string]: {
        [containerName: string]: string; // "ok" or error message
    };
}

const docker = new Docker();

/**
 * Extracts the container name from Docker container info, removing the leading slash
 */
export function extractContainerName(container: Docker.ContainerInfo): string {
    return container.Names[0].replace(CONTAINER_NAME_PREFIX, '');
}

/**
 * Validates that x-magic-proxy data has all required fields
 */
export function validateXMagicProxy(
    xMagicProxy: Partial<XMagicProxyData> | undefined,
    containerName: string
): xMagicProxy is XMagicProxyData {
    if (!xMagicProxy) {
        return false;
    }

    if (!xMagicProxy.template) {
        console.warn(
            `[Docker Provider] Container "${containerName}" has malformed x-magic-proxy: missing required field "template"`
        );
        return false;
    }

    if (!xMagicProxy.target) {
        console.warn(
            `[Docker Provider] Container "${containerName}" has malformed x-magic-proxy: missing required field "target"`
        );
        return false;
    }

    if (!xMagicProxy.hostname) {
        console.warn(
            `[Docker Provider] Container "${containerName}" has malformed x-magic-proxy: missing required field "hostname"`
        );
        return false;
    }

    return true;
}

/**
 * Extracts x-magic-proxy configuration from compose file services
 */
export function extractXMagicProxy(
    composeData: ComposeFileData | undefined
): Partial<XMagicProxyData> | undefined {
    if (!composeData?.services) {
        return undefined;
    }

    // Find the first service with x-magic-proxy defined
    for (const service of Object.values(composeData.services)) {
        if (service['x-magic-proxy']) {
            return service['x-magic-proxy'];
        }
    }

    return undefined;
}

/**
 * Groups containers by their Docker Compose file path
 */
export function groupContainersByComposeFile(
    containers: Docker.ContainerInfo[]
): ComposeFileReference[] {
    const composeFileMap = new Map<string, Docker.ContainerInfo[]>();
    const containersWithoutComposeFile: Docker.ContainerInfo[] = [];

    for (const container of containers) {
        const composePath = container.Labels[COMPOSE_CONFIG_LABEL];

        if (composePath) {
            if (!composeFileMap.has(composePath)) {
                composeFileMap.set(composePath, []);
            }
            composeFileMap.get(composePath)!.push(container);
        } else {
            containersWithoutComposeFile.push(container);
        }
    }

    // Warn about containers without compose files
    if (containersWithoutComposeFile.length > 0) {
        const containerNames = containersWithoutComposeFile
            .map(c => extractContainerName(c))
            .join(', ');
        console.warn(
            `[Docker Provider] ${containersWithoutComposeFile.length} container(s) have no compose file label: ${containerNames}`
        );
    }

    // Convert map to array of ComposeFileReference objects
    const result: ComposeFileReference[] = [];
    composeFileMap.forEach((containers, path) => {
        result.push({
            path,
            containers
        });
    });

    return result;
}

/**
 * Reads and parses Docker Compose files referenced by containers
 */
export async function loadComposeData(): Promise<ComposeFileReference[]> {
    let containers: Docker.ContainerInfo[];
    
    try {
        containers = await docker.listContainers({ all: true });
    } catch (error) {
        console.error(
            '[Docker Provider] Failed to list Docker containers:',
            error instanceof Error ? error.message : String(error)
        );
        return [];
    }

    const composeFiles = groupContainersByComposeFile(containers);

    for (const composeFile of composeFiles) {
        const path = composeFile.path;

        if (typeof path !== 'string') {
            composeFile.error = 'No compose file path found in container labels';
            continue;
        }

        try {
            const fileContent = await fs.promises.readFile(path, 'utf-8');
            composeFile.composeData = yaml.load(fileContent) as ComposeFileData;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            composeFile.error = errorMessage;
            
            const containerNames = composeFile.containers
                .map(c => extractContainerName(c))
                .join(', ');
            
            console.error(
                `[Docker Provider] Failed to read/parse compose file "${path}" for containers [${containerNames}]: ${errorMessage}`
            );
        }
    }

    return composeFiles;
}

/**
 * Creates host entries from Docker containers with x-magic-proxy configuration
 * Returns both the manifest and processing results for each container
 */
export async function buildContainerManifest(): Promise<{
    manifest: HostEntry[];
    results: ProcessingResult;
}> {
    const composeFiles = await loadComposeData();
    const manifest: HostEntry[] = [];
    const results: ProcessingResult = {};

    for (const composeFile of composeFiles) {
        const composePath = composeFile.path || 'unknown';
        
        if (!results[composePath]) {
            results[composePath] = {};
        }

        if (composeFile.error) {
            // Mark all containers from this compose file as failed
            for (const container of composeFile.containers) {
                const containerName = extractContainerName(container);
                results[composePath][containerName] = `Failed to load compose file: ${composeFile.error}`;
            }
            continue;
        }

        if (!composeFile.composeData) {
            const containerNames = composeFile.containers
                .map(c => extractContainerName(c))
                .join(', ');
            
            console.warn(
                `[Docker Provider] Skipping containers [${containerNames}] from "${composePath}": compose data missing`
            );
            
            for (const container of composeFile.containers) {
                const containerName = extractContainerName(container);
                results[composePath][containerName] = 'Compose data is missing';
            }
            continue;
        }

        // Process each container in this compose file
        for (const container of composeFile.containers) {
            const containerName = extractContainerName(container);

            // Extract x-magic-proxy configuration
            const xMagicProxy = extractXMagicProxy(composeFile.composeData);

            if (!xMagicProxy) {
                // Container doesn't have x-magic-proxy - this is normal, just skip silently
                results[composePath][containerName] = 'No x-magic-proxy configuration found';
                continue;
            }

            // Validate x-magic-proxy configuration
            if (!validateXMagicProxy(xMagicProxy, containerName)) {
                results[composePath][containerName] = 'Invalid x-magic-proxy configuration (missing required fields)';
                continue;
            }

            // Successfully validated - add to manifest
            manifest.push({
                containerName,
                xMagicProxy,
                composeFilePath: composePath,
                composeData: composeFile.composeData,
                lastChanged: Date.now(),
                state: {}
            });

            results[composePath][containerName] = 'ok';
        }
    }

    return { manifest, results };
}

/**
 * Updates the host database with containers from Docker that have x-magic-proxy configuration
 * @param hostDb - The HostDB instance to update
 * @returns Processing results showing the status of each container
 */
export async function updateDatabaseFromManifest(hostDb: HostDB): Promise<ProcessingResult> {
    const { manifest, results } = await buildContainerManifest();
    
    // Update the provided HostDB instance with the manifest entries
    for (const entry of manifest) {
        try {
            hostDb.upsert(entry);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(
                `[Docker Provider] Failed to upsert entry for container "${entry.containerName}": ${errorMessage}`
            );
            
            // Update the result to reflect the upsert failure
            const composePath = entry.composeFilePath;
            if (results[composePath]) {
                results[composePath][entry.containerName] = `Database upsert failed: ${errorMessage}`;
            }
        }
    }

    // Log summary
    const totalContainers = Object.values(results).reduce(
        (sum, containerResults) => sum + Object.keys(containerResults).length,
        0
    );
    const successfulContainers = Object.values(results).reduce(
        (sum, containerResults) => 
            sum + Object.values(containerResults).filter(status => status === 'ok').length,
        0
    );

    console.log(
        `[Docker Provider] Processed ${totalContainers} container(s): ${successfulContainers} added to database, ${totalContainers - successfulContainers} skipped/failed`
    );

    return results;
}



