/**
 * Traefik Dynamic Configuration File Format
 * @see https://doc.traefik.io/traefik/reference/dynamic-configuration/file/
 */

/** TLS configuration for routers */
export type TlsConfig = boolean | {
    options?: string;
    certResolver?: string;
    passthrough?: boolean;
};

/** Load balancer server entry */
export type LoadBalancerServer = {
    url?: string;      // For HTTP services
    address?: string;  // For TCP/UDP services
};

/** Sticky session cookie configuration */
export type StickyCookie = {
    name?: string;
    secure?: boolean;
    httpOnly?: boolean;
};

/** HTTP router configuration */
export type HttpRouter = {
    rule: string;
    service: string;
    entryPoints?: string[];
    middlewares?: string[];
    priority?: number;
    tls?: TlsConfig;
};

/** HTTP service configuration */
export type HttpService = {
    loadBalancer?: {
        servers: LoadBalancerServer[];
        passHostHeader?: boolean;
        sticky?: { cookie?: StickyCookie };
    };
    mirroring?: {
        service: string;
        percent?: number;
    };
    weighted?: {
        services: { name: string; weight: number }[];
    };
};

/** HTTP middleware configuration (extensible for all middleware types) */
export type HttpMiddleware = Record<string, unknown>;

/** TCP router configuration */
export type TcpRouter = {
    rule: string;
    service: string;
    entryPoints?: string[];
    tls?: TlsConfig;
    priority?: number;
};

/** TCP service configuration */
export type TcpService = {
    loadBalancer?: {
        servers: { address: string }[];
        passHostHeader?: boolean;
    };
    weighted?: {
        services: { name: string; weight: number }[];
    };
};

/** UDP service configuration */
export type UdpService = {
    loadBalancer?: {
        servers: { address: string }[];
    };
};

/**
 * Complete Traefik dynamic configuration structure.
 */
export type TraefikConfigYamlFormat = {
    http?: {
        routers?: Record<string, HttpRouter>;
        services?: Record<string, HttpService>;
        middlewares?: Record<string, HttpMiddleware>;
    };
    tcp?: {
        routers?: Record<string, TcpRouter>;
        services?: Record<string, TcpService>;
    };
    udp?: {
        services?: Record<string, UdpService>;
    };
};
