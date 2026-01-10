import Docker from 'dockerode';
import { XMagicProxyData } from './xmagic';

// Definition of Docker Compose file structure, with support for
// our custom x-magic-proxy object under services.<service>.x-magic-proxy
export type ComposeFileData = {
    version?: string | number;

    services?: Record<
        string,
        {
            image?: string;
            build?: string | { context?: string; dockerfile?: string; args?: Record<string, string> };
            container_name?: string;
            command?: string | string[];
            entrypoint?: string | string[];
            environment?: Record<string, string> | string[];
            env_file?: string | string[];
            ports?: Array<string | { target: number; published?: number; protocol?: 'tcp' | 'udp'; mode?: 'ingress' | 'host' }>;
            volumes?: Array<string | { type?: 'volume' | 'bind' | 'tmpfs'; source?: string; target: string; read_only?: boolean }>;
            depends_on?: string[] | Record<string, { condition?: 'service_started' | 'service_healthy' }>;
            networks?: string[] | Record<string, { aliases?: string[] }>;
            restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
            deploy?: {
                replicas?: number;
                resources?: {
                    limits?: { cpus?: string; memory?: string };
                    reservations?: { cpus?: string; memory?: string };
                };
                restart_policy?: { condition?: 'none' | 'on-failure' | 'any'; delay?: string; max_attempts?: number; window?: string };
                placement?: { constraints?: string[] };
                update_config?: { parallelism?: number; delay?: string; order?: 'start-first' | 'stop-first' };
            };
            extra_hosts?: string[];
            logging?: { driver?: string; options?: Record<string, string> };
            healthcheck?: {
                test: string | string[];
                interval?: string;
                timeout?: string;
                retries?: number;
                start_period?: string;
            };
            'x-magic-proxy'?: XMagicProxyData;
        }
    >;

    volumes?: Record<
        string,
        { driver?: string; driver_opts?: Record<string, string>; external?: boolean }
    >;

    networks?: Record<
        string,
        { driver?: string; driver_opts?: Record<string, string>; external?: boolean }
    >;

    configs?: Record<string, { file?: string; external?: boolean }>;

    secrets?: Record<string, { file?: string; external?: boolean }>;
};



export function watchDockerEvents(onContainerChange: () => void) {
    async function connect() {
        const stream = await docker.getEvents({ filters: { type: ['container'] } });
        stream.on('data', (chunk: Buffer) => {
            try {
                const ev = JSON.parse(chunk.toString());
                if (ev.Type === 'container' && ['create', 'destroy'].includes(ev.Action)) {
                    onContainerChange();
                }
            } catch { }
        });
        stream.on('error', () => setTimeout(connect, 1000));
        stream.on('end', () => setTimeout(connect, 1000));
    }
    connect();
}

export interface ComposeFileReference {
    path: string | null;
    error?: string;
    composeFile?: string | null;
    // composeData contains x-magic-proxy info if successfully loaded
    composeData?: ComposeFileData;
    containers: Docker.ContainerInfo[];
}
