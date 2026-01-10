export type MagicProxyConfigFile = {
    proxyBackend: 'traefik'; // currently only traefik is supported
    traefik?: {
        // Output file for Traefik dynamic configuration
        outputFile: string;
        // Template files that will be used to generate Traefik dynamic configuration
        // Services in compose files should reference these by filename
        templates?: string[];
    };
    api?: {
        // Enable or disable the Magic Proxy API
        enabled: boolean;
        // Port for the Magic Proxy API
        port: number;
    };

    // requires any to allow additional properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // allow additional properties
};
