import fs from 'fs';
import { loadConfigFile, getDefaultConfigFile } from './config';
import { MagicProxyConfigFile } from './types/config';
import { zone } from './logging/zone';

const log = zone('config-watcher');

/** Current file watcher instance */
let watcher: fs.FSWatcher | null = null;

/** Prevents rapid repeated restarts */
let isRestarting = false;

/**
 * Callback function that is called when config file changes
 * Expected to handle cleanup and restart with new config
 */
type OnConfigChangeCallback = (newConfig: MagicProxyConfigFile) => Promise<void>;

let onConfigChangeCallback: OnConfigChangeCallback | null = null;

/**
 * Start watching the config file for changes
 * 
 * @param callback - Function to call when config file changes and is valid
 */
export function startWatchingConfigFile(callback: OnConfigChangeCallback): void {
    onConfigChangeCallback = callback;
    attachConfigWatcher();
}

/**
 * Attach or re-attach the watcher to the config file.
 * Called on initial start and after atomic writes (rename events).
 */
function attachConfigWatcher(): void {
    const configPath = getDefaultConfigFile();
    
    watcher = fs.watch(configPath, async (eventType) => {
        if (isRestarting) return;
        
        log.debug({
            message: 'Config file watcher event',
            data: { eventType, configPath }
        });

        // On rename events (atomic writes), re-attach the watcher
        // because the original inode may have been replaced
        if (eventType === 'rename') {
            log.debug({
                message: 'Detected atomic write (rename) - re-attaching watcher',
                data: { configPath }
            });

            // Close the old watcher
            if (watcher) {
                watcher.close();
            }

            // Re-attach after a small delay to ensure file is fully written
            setTimeout(() => {
                if (watcher === null) {
                    attachConfigWatcher();
                }
            }, 100);

            return;
        }

        // Process 'change' events
        if (eventType === 'change') {
            isRestarting = true;
            
            // Give file write time to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                // Verify new config is valid before notifying
                const newConfig = await loadConfigFile();
                
                log.info({
                    message: 'Config file changed - notifying handler',
                    data: { configPath }
                });
                
                // Call the provided callback to handle restart
                if (onConfigChangeCallback) {
                    await onConfigChangeCallback(newConfig);
                }
            } catch (err) {
                log.error({
                    message: 'Failed to process config file change',
                    data: { error: err instanceof Error ? err.message : String(err) }
                });
                isRestarting = false;
            }
        }
    });

    watcher.on('error', (err) => {
        log.error({
            message: 'Config file watcher error',
            data: { error: err instanceof Error ? err.message : String(err) }
        });
    });

    log.debug({
        message: 'Watching config file for changes',
        data: { path: configPath }
    });
}

/**
 * Stop watching the config file
 */
export function stopWatchingConfigFile(): void {
    if (watcher) {
        watcher.close();
        watcher = null;
        log.debug({ message: 'Stopped watching config file' });
    }
    onConfigChangeCallback = null;
    isRestarting = false;
}

/**
 * Reset the restart flag (called after successful restart)
 */
export function resetRestartFlag(): void {
    isRestarting = false;
}
