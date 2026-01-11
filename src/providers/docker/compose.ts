import Docker from 'dockerode';
import fs from 'fs';
import yaml from 'js-yaml';
import isDocker from 'is-docker';
import { ComposeFileData } from '../../types/docker';
import { XMagicProxyData, XMagicProxySchema } from '../../types/xmagic';
import { zone } from '../../logging/zone';
import { ComposeFileReference, COMPOSE_CONFIG_LABEL, COMPOSE_SERVICE_LABEL } from './types';

const log = zone('providers.docker');

/** Whether we're running inside a Docker container */
const runningInDocker = isDocker();

/**
 * Resolves a host path to a container-accessible path.
 * When running inside Docker with host filesystem mounted at /host,
 * prepends /host to absolute paths.
 */
function resolveHostPath(hostPath: string): string {
    if (runningInDocker && hostPath.startsWith('/')) {
        return `/host${hostPath}`;
    }
    return hostPath;
}

/**
 * Extracts the container name from Docker container info, removing the leading slash
 */
export function extractContainerName(container: Docker.ContainerInfo): string {
    return container.Names[0].replace(/^\//, '');
}

/**
 * Gets the service name from container labels
 */
export function getServiceName(container: Docker.ContainerInfo): string | undefined {
    return container.Labels[COMPOSE_SERVICE_LABEL];
}

/**
 * Groups containers by their Docker Compose file path
 */
export function groupContainersByComposeFile(
    containers: Docker.ContainerInfo[]
): ComposeFileReference[] {
    const composeFileMap = new Map<string, Docker.ContainerInfo[]>();
    const orphanContainers: Docker.ContainerInfo[] = [];

    for (const container of containers) {
        const composePath = container.Labels[COMPOSE_CONFIG_LABEL];

        if (composePath) {
            const existing = composeFileMap.get(composePath) || [];
            existing.push(container);
            composeFileMap.set(composePath, existing);
        } else {
            orphanContainers.push(container);
        }
    }

    // Warn about containers without compose files
    if (orphanContainers.length > 0) {
        const names = orphanContainers.map(c => extractContainerName(c)).join(', ');
        log.warn({
            message: 'Some containers have no compose file label',
            data: { count: orphanContainers.length, containerNames: names }
        });
    }

    return Array.from(composeFileMap.entries()).map(([path, containers]) => ({
        path,
        containers
    }));
}

/**
 * Reads and parses a Docker Compose file
 */
export async function loadComposeFile(path: string): Promise<ComposeFileData | undefined> {
    const resolvedPath = resolveHostPath(path);
    try {
        const content = await fs.promises.readFile(resolvedPath, 'utf-8');
        return yaml.load(content) as ComposeFileData;
    } catch (error) {
        log.error({
            message: 'Failed to read/parse compose file',
            data: { path, resolvedPath, error: error instanceof Error ? error.message : String(error) }
        });
        return undefined;
    }
}

/**
 * Loads compose data for all compose file references
 */
export async function loadComposeDataForRefs(
    docker: Docker
): Promise<ComposeFileReference[]> {
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

    const refs = groupContainersByComposeFile(containers);

    // Load compose data for each reference
    await Promise.all(refs.map(async (ref) => {
        const data = await loadComposeFile(ref.path);
        if (data) {
            ref.composeData = data;
        } else {
            ref.error = 'Failed to load compose file';
        }
    }));

    return refs;
}

/**
 * Extracts x-magic-proxy configuration for a specific service from compose data
 */
export function extractXMagicProxy(
    composeData: ComposeFileData | undefined,
    serviceName?: string
): Partial<XMagicProxyData> | undefined {
    if (!composeData?.services) {
        return undefined;
    }

    // If service name provided, look up that specific service only
    if (serviceName) {
        // Service name specified but not found in compose file - return undefined
        // (the container is orphaned or the service was removed)
        if (!composeData.services[serviceName]) {
            return undefined;
        }
        return composeData.services[serviceName]['x-magic-proxy'];
    }

    // Fallback (no service name): find the first service with x-magic-proxy defined
    for (const service of Object.values(composeData.services)) {
        if (service['x-magic-proxy']) {
            return service['x-magic-proxy'];
        }
    }

    return undefined;
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

    const result = XMagicProxySchema.safeParse(xMagicProxy);
    if (result.success) {
        return true;
    }

    const issues = result.error.issues;
    const isMissingField = (field: string) =>
        issues.some(i => i.path[0] === field && /received undefined/i.test(i.message));

    // Log specific missing field warnings
    for (const field of ['template', 'target', 'hostname']) {
        if (isMissingField(field)) {
            log.warn({
                message: `Container has malformed x-magic-proxy: missing required field "${field}"`,
                data: { containerName }
            });
            return false;
        }
    }

    // Generic warning for other schema issues
    const reason = issues.map(i => {
        const path = i.path.length ? i.path.join('.') : 'value';
        return `${path} ${i.message}`;
    }).join('; ');

    log.warn({
        message: 'Container has malformed x-magic-proxy',
        data: { containerName, reason }
    });

    return false;
}
