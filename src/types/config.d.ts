export interface APIConfig {
    // Enable or disable the Magic Proxy API
    enabled: boolean;
    // Port for the Magic Proxy API
    port: number;
    // Optional API key for authentication (if set, all requests must provide this key)
    key?: string;
    // Allow listing all available API routes (default: false)
    allowListingRoutes?: boolean;
    // Request timeout in milliseconds (default: 1000ms)
    timeout?: number;
}

export type MagicProxyConfigFile = {
    proxyBackend: 'traefik'; // currently only traefik is supported
    traefik?: {
        // Output file for Traefik dynamic configuration
        outputFile: string;
        // Template files that will be used to generate Traefik dynamic configuration
        // Services in compose files should reference these by filename
        templates?: string[];
    };
    api?: APIConfig;

    // Allow additional properties on the config file object
    [key: string]: unknown; // allow additional properties
};
