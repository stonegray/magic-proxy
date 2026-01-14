import { XMagicProxyData } from './xmagic';

/**
 * Docker Compose file structure with support for custom x-magic-proxy extension.
 * @see https://docs.docker.com/compose/compose-file/
 */
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
