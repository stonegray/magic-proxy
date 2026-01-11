export type TraefikConfigYamlFormat = {
    http?: {
        routers?: Record<string, {
            rule: string;
            service: string;
            entryPoints?: string[];
            middlewares?: string[];
            priority?: number;
            tls?: boolean | { options?: string; certResolver?: string };
        }>;
        services?: Record<string, {
            loadBalancer?: {
                servers: { url: string }[];
                passHostHeader?: boolean;
                sticky?: { cookie?: { name?: string; secure?: boolean; httpOnly?: boolean } };
            };
            mirroring?: {
                service: string;
                percent?: number;
            };
            weighted?: {
                services: { name: string; weight: number }[];
            };
        }>;
        middlewares?: Record<string, {

            // We use a catch-all index signature here to allow for middleware configuration of
            // arbitrary shape since Traefik supports many middleware types (redirect, retry, headers, rateLimit, etc.)
            [key: string]: unknown; // catch-all for middleware types
        }>;
    };
    tcp?: {
        routers?: Record<string, {
            rule: string;
            service: string;
            entryPoints?: string[];
            tls?: boolean | { passthrough?: boolean; options?: string };
            priority?: number;
        }>;
        services?: Record<string, {
            loadBalancer?: {
                servers: { address: string }[];
                passHostHeader?: boolean;
            };
            weighted?: {
                services: { name: string; weight: number }[];
            };
        }>;
    };
    udp?: {
        services?: Record<string, {
            loadBalancer?: {
                servers: { address: string }[];
            };
        }>;
    };
};
