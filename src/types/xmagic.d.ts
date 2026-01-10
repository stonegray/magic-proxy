// Definition of the structure of the x-magic-proxy object
// under services.<service>.x-magic-proxy in a Docker Compose file
export type XMagicProxyData = {
    template: string; // name of the template file to use (e.g., "example.yml")
    target: string;
    hostname: string;
    idle?: string;
    auth?: {
        type: string;
        provider: string;
        scopes?: string[];
        match?: string;
    };
    userData?: Record<string, unknown>;
};
