import Docker from 'dockerode';
import { ComposeFileReference, ComposeFileData } from './types/docker';
import fs from 'fs';
import yaml from 'js-yaml';
import { XMagicProxyData } from './types/xmagic';
import { HostDB } from './hostDb';
import { HostEntry } from './types/host';

const docker = new Docker();

export function getComposeFilesFromDockerPs(containers: Docker.ContainerInfo[]): ComposeFileReference[] {
    try {
        // Group containers by compose file path
        const composeFileMap = new Map<string, Docker.ContainerInfo[]>();

        containers.forEach(container => {
            const composePath = container.Labels['com.docker.compose.project.config_files'];

            if (composePath) {
                if (!composeFileMap.has(composePath)) {
                    composeFileMap.set(composePath, []);
                }
                composeFileMap.get(composePath)?.push(container);
            }
        });

        // Convert map to array of ComposeFile objects
        const result: ComposeFileReference[] = [];
        composeFileMap.forEach((containers, path) => {
            result.push({
                path,
                containers
            });
        });

        return result;
    } catch (error) {
        console.error('Error parsing Docker ps output:', error);
        return [];
    }
}

// Actually read the files and parse YAML  to ComposeFileData
export async function getComposeData(): Promise<ComposeFileReference[]> {
    const containers = await docker.listContainers({ all: true });
    const composeFiles = getComposeFilesFromDockerPs(containers);


    for (const composeFile of composeFiles) {

        // capturing path so TS knows it's not string|null later
        const path = composeFile.path;

        if (typeof path !== 'string') {
            composeFile.error = 'No compose file path found in container labels.';
            continue;
        }

        try {
            const fileContent = await fs.promises.readFile(path, 'utf-8');

            // Mutate the original object
            composeFile.composeData = yaml.load(fileContent) as ComposeFileData;
        } catch (error) {
            composeFile.error = error instanceof Error ? error.message : String(error);
            continue;
        }
    }

    // Now every composeFile in the array has .composeData
    return composeFiles;

}



export async function makeContainerManifest() {
    const composeFiles = await getComposeData();
    const manifest: HostEntry[] = [];

    for (const composeFile of composeFiles) {
        if (!composeFile.composeData) {
            console.warn("WARN: skipped container manifest entry due to missing compose data:", composeFile.path);
            continue; // skip if no compose data
        }

        for (const container of composeFile.containers) {
            const containerName = container.Names[0].replace(/^\//, ''); // remove leading slash
            // avoid noisy logging of container names

            // Use containerName directly, no service lookup
            const xMagicProxy = composeFile.composeData?.services
                ? Object.values(composeFile.composeData.services)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map(s => s as any)
                    .find(def => def['x-magic-proxy'])?.['x-magic-proxy']
                : undefined;

            if (xMagicProxy) {
                // Validate that x-magic-proxy has a 'template' field
                if (!xMagicProxy.template) {
                    console.warn(`WARN: ${containerName} contains a malformed x-magic-proxy variable; missing required key "template"`);
                    continue; // skip containers without template
                }

                manifest.push({
                    containerName,
                    xMagicProxy: xMagicProxy as XMagicProxyData,
                    composeFilePath: composeFile.path || '',
                    composeData: composeFile.composeData,
                    lastChanged: Date.now(),
                    state: {}
                });
            }
        }
    }

    return manifest;
}



export function watchDockerEvents(onContainerChange: () => void) {
    const THROTTLE_MS = 1000; // rate limit interval
    let lastCall = 0;
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    function scheduleCall() {
        const now = Date.now();
        const since = now - lastCall;

        if (since >= THROTTLE_MS) {
            lastCall = now;
            try { onContainerChange(); } catch { /* ignore */ }
            return;
        }

        if (scheduled) return; // already scheduled

        scheduled = setTimeout(() => {
            scheduled = null;
            lastCall = Date.now();
            try { onContainerChange(); } catch { /* ignore */ }
        }, THROTTLE_MS - since);
    }

    async function connect() {
        const stream = await docker.getEvents({ filters: { type: ['container'] } });
        stream.on('data', (chunk: Buffer) => {
            try {
                const ev = JSON.parse(chunk.toString());
                if (ev.Type === 'container' && ['create', 'start', 'die', 'destroy'].includes(ev.Action)) {
                    scheduleCall();
                }
            } catch { /* ignore */ }
        });
        stream.on('error', () => setTimeout(connect, 1000));
        stream.on('end', () => setTimeout(connect, 1000));
    }
    connect();
}


export async function updateDatabaseFromManifest(hostDb: HostDB) {
    const manifest = await makeContainerManifest();
    // Update the provided HostDB instance with the manifest entries
    for (const entry of manifest) {
        hostDb.upsert(entry);
    }

}



