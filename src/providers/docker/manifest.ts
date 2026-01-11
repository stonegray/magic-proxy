import Docker from 'dockerode';
import { HostEntry } from '../../types/host';
import { zone } from '../../logging/zone';
import { ProcessingResult, COMPOSE_SERVICE_LABEL } from './types';
import {
    loadComposeDataForRefs,
    extractContainerName,
    extractXMagicProxy,
    validateXMagicProxy
} from './compose';

const log = zone('providers.docker');

/**
 * Builds a manifest of host entries from Docker containers with x-magic-proxy configuration
 */
export async function buildContainerManifest(docker: Docker): Promise<{
    manifest: HostEntry[];
    results: ProcessingResult;
}> {
    const refs = await loadComposeDataForRefs(docker);
    const manifest: HostEntry[] = [];
    const results: ProcessingResult = {};

    for (const ref of refs) {
        const composePath = ref.path;
        results[composePath] = {};

        if (ref.error || !ref.composeData) {
            // Mark all containers from this compose file as failed
            for (const container of ref.containers) {
                const name = extractContainerName(container);
                results[composePath][name] = ref.error || 'Compose data is missing';
            }
            continue;
        }

        // Process each container in this compose file
        for (const container of ref.containers) {
            const containerName = extractContainerName(container);
            const serviceName = container.Labels[COMPOSE_SERVICE_LABEL];
            const xMagicProxy = extractXMagicProxy(ref.composeData, serviceName);

            if (!xMagicProxy) {
                results[composePath][containerName] = 'No x-magic-proxy configuration found';
                continue;
            }

            if (!validateXMagicProxy(xMagicProxy, containerName)) {
                results[composePath][containerName] = 'Invalid x-magic-proxy configuration';
                continue;
            }

            manifest.push({
                containerName,
                xMagicProxy,
                composeFilePath: composePath,
                composeData: ref.composeData,
                lastChanged: Date.now(),
                state: {}
            });

            results[composePath][containerName] = 'ok';
        }
    }

    return { manifest, results };
}

/**
 * Logs a summary of the processing results
 */
export function logManifestSummary(results: ProcessingResult): void {
    const total = Object.values(results).reduce(
        (sum, r) => sum + Object.keys(r).length, 0
    );
    const added = Object.values(results).reduce(
        (sum, r) => sum + Object.values(r).filter(s => s === 'ok').length, 0
    );

    log.info({
        message: 'Processed container(s)',
        data: { total, added, skippedOrFailed: total - added }
    });
}
