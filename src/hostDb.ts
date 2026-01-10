import EventEmitter from 'events';
import { HostEntry } from './types/host';


type HostDBEvents = {
    added: HostEntry;
    updated: HostEntry;
    removed: HostEntry;
};

export class HostDB extends EventEmitter {
    private db = new Map<string, HostEntry>();

    // Upsert or update a host entry
    upsert(entry: HostEntry) {
        const key = entry.containerName;
        const old = this.db.get(key);

        entry.lastChanged = Date.now();

        if (!old) {
            this.db.set(key, entry);
            this.emit('added', entry);
        } else {
            const changed =
                JSON.stringify({
                    xMagicProxy: old.xMagicProxy,
                    composeFilePath: old.composeFilePath,
                    composeData: old.composeData,
                    state: old.state,
                }) !==
                JSON.stringify({
                    xMagicProxy: entry.xMagicProxy,
                    composeFilePath: entry.composeFilePath,
                    composeData: entry.composeData,
                    state: entry.state,
                });

            if (changed) {
                this.db.set(key, entry);
                this.emit('updated', entry);
            }
        }
    }

    remove(containerName: string) {
        const entry = this.db.get(containerName);
        if (entry) {
            this.db.delete(containerName);
            this.emit('removed', entry);
        }
    }

    get(containerName: string) {
        return this.db.get(containerName);
    }

    getAll() {
        return Array.from(this.db.values());
    }
}