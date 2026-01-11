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

    // Allow additional properties on the config file object
    [key: string]: unknown; // allow additional properties
};
