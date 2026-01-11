import Docker from 'dockerode';
import { ComposeFileData } from '../../types/docker';

/**
 * Labels used by Docker Compose to identify containers and their source files
 */
export const COMPOSE_CONFIG_LABEL = 'com.docker.compose.project.config_files';
export const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service';

/**
 * Reference to a Docker Compose file and its associated containers
 */
export interface ComposeFileReference {
    path: string;
    containers: Docker.ContainerInfo[];
    composeData?: ComposeFileData;
    error?: string;
}

/**
 * Processing result for container manifest building
 * Maps compose file paths to container results
 */
export interface ProcessingResult {
    [composeFilePath: string]: {
        [containerName: string]: string; // "ok" or error message
    };
}

/**
 * Configuration for the Docker provider
 */
export interface DockerProviderConfig {
    /** Minimum interval between sync operations in ms (default: 1000) */
    syncIntervalMs?: number;
}
