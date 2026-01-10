import { XMagicProxyData } from './xmagic';
import { ComposeFileData } from './docker';

// TODO: These are kinda arbitrary for now, but can be expanded later
export type HostStateFlags = {
    needsUpdate?: boolean;
    isActive?: boolean;
    [key: string]: boolean | undefined;
};

export type HostEntry = {
    containerName: string;            // Docker full container name
    xMagicProxy: XMagicProxyData;         // extracted from compose file
    composeFilePath: string;          // path to the compose file
    composeData: ComposeFileData;     // parsed YAML for reference
    lastChanged: number;              // timestamp (ms)
    state: HostStateFlags;            // arbitrary bool flags
};
