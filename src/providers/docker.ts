import Docker from 'dockerode';
import { ComposeFileReference, ComposeFileData } from '../types/docker';
import fs from 'fs';
import yaml from 'js-yaml';
import { XMagicProxyData, validateXMagicProxyData, XMagicProxySchema } from '../types/xmagic';
import { HostDB } from '../hostDb';
import { HostEntry } from '../types/host';
import { zone } from '../logging/zone';

const log = zone('providers.docker');

// Constants
const COMPOSE_CONFIG_LABEL = 'com.docker.compose.project.config_files';
const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service';
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

    // Use Zod schema directly so we can inspect issues for precise logging
    const safe = XMagicProxySchema.safeParse(xMagicProxy);
    if (safe.success) return true;

    const issues = safe.error.issues;

    const isMissingField = (field: string) =>
        issues.some((issue) => issue.path[0] === field && /received undefined/i.test(issue.message));

    if (isMissingField('template')) {
        log.warn({
            message: 'Container has malformed x-magic-proxy: missing required field "template"',
            data: { containerName }
        });
        return false;
    }

    if (isMissingField('target')) {
        log.warn({
            message: 'Container has malformed x-magic-proxy: missing required field "target"',
            data: { containerName }
        });
        return false;
    }

    if (isMissingField('hostname')) {
        log.warn({
            message: 'Container has malformed x-magic-proxy: missing required field "hostname"',
            data: { containerName }
        });
        return false;
    }

    // Build human readable reason from issues
    const reason = safe.error.issues
        .map((issue) => {
            const path = issue.path.length ? issue.path.join('.') : 'value';
            return `${path} ${issue.message}`;
        })
        .join('; ');

    // Generic warning for other schema issues (e.g. invalid URL, bad userData types)
    log.warn({
        message: 'Container has malformed x-magic-proxy',
        data: { containerName, reason }
    });

    return false;
}

/**
 * Extracts x-magic-proxy configuration for a specific service from compose file
 * @param composeData - The parsed compose file data
 * @param serviceName - The service name to look up (optional, if not provided returns first found)
 */
export function extractXMagicProxy(
    composeData: ComposeFileData | undefined,
    serviceName?: string
): Partial<XMagicProxyData> | undefined {
    if (!composeData?.services) {
        return undefined;
    }

    // If service name provided, look up that specific service
    if (serviceName && composeData.services[serviceName]) {
        return composeData.services[serviceName]['x-magic-proxy'];
    }

    // Fallback: find the first service with x-magic-proxy defined
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
        log.warn({
            message: 'Some containers have no compose file label',
            data: {
                count: containersWithoutComposeFile.length,
                containerNames
            }
        });
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
        log.error({
            message: 'Failed to list Docker containers',
            data: { error: error instanceof Error ? error.message : String(error) }
        });
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
            
            log.error({
                message: 'Failed to read/parse compose file',
                data: {
                    path,
                    containerNames,
                    error: errorMessage
                }
            });
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
            
            log.warn({
                message: 'Skipping containers due to missing compose data',
                data: {
                    path: composePath,
                    containerNames
                }
            });
            
            for (const container of composeFile.containers) {
                const containerName = extractContainerName(container);
                results[composePath][containerName] = 'Compose data is missing';
            }
            continue;
        }

        // Process each container in this compose file
        for (const container of composeFile.containers) {
            const containerName = extractContainerName(container);
            const serviceName = container.Labels[COMPOSE_SERVICE_LABEL];

            // Extract x-magic-proxy configuration for this specific service
            const xMagicProxy = extractXMagicProxy(composeFile.composeData, serviceName);

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
            log.error({
                message: 'Failed to upsert entry for container',
                data: {
                    containerName: entry.containerName,
                    error: errorMessage
                }
            });
            
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

    log.info({
        message: 'Processed container(s)',
        data: {
            total: totalContainers,
            added: successfulContainers,
            skippedOrFailed: totalContainers - successfulContainers
        }
    });

    return results;
}



