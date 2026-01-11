/**
 * Docker Provider - monitors Docker containers and compose files for x-magic-proxy configuration
 */

// Main provider class
export { DockerProvider } from './provider';

// Types
export {
    ProcessingResult,
    ComposeFileReference,
    DockerProviderConfig,
    COMPOSE_CONFIG_LABEL,
    COMPOSE_SERVICE_LABEL
} from './types';

// Compose file utilities
export {
    extractContainerName,
    getServiceName,
    groupContainersByComposeFile,
    loadComposeFile,
    loadComposeDataForRefs,
    extractXMagicProxy,
    validateXMagicProxy
} from './compose';

// Manifest building
export {
    buildContainerManifest,
    logManifestSummary
} from './manifest';
