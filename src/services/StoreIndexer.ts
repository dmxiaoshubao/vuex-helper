import * as vscode from 'vscode';
import { EntryAnalyzer } from './EntryAnalyzer';
import { StoreParser } from './StoreParser';
import { VuexStoreMap, VuexStateInfo, VuexGetterInfo, VuexMutationInfo, VuexActionInfo } from '../types';

export interface IndexOptions {
    interactive?: boolean;
}

export class StoreIndexer {
    private workspaceRoot: string;
    private entryAnalyzer: EntryAnalyzer;
    private storeParser: StoreParser;
    private storeMap: VuexStoreMap | null = null;
    private lastStoreEntryPath: string | null = null;
    private indexingPromise: Promise<void> | null = null;
    private rerunRequested = false;
    private rerunInteractive = false;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.entryAnalyzer = new EntryAnalyzer(workspaceRoot);
        this.storeParser = new StoreParser(workspaceRoot);
    }

    public async index(options: IndexOptions = {}) {
        const interactive = options.interactive === true;
        if (this.indexingPromise) {
            this.rerunRequested = true;
            this.rerunInteractive = this.rerunInteractive || interactive;
            return this.indexingPromise;
        }

        try {
            this.indexingPromise = this.performIndex(interactive);
            await this.indexingPromise;
            while (this.rerunRequested) {
                const nextInteractive = this.rerunInteractive;
                this.rerunRequested = false;
                this.rerunInteractive = false;
                this.indexingPromise = this.performIndex(nextInteractive);
                await this.indexingPromise;
            }
        } finally {
            this.indexingPromise = null;
            this.rerunInteractive = false;
        }
    }

    private async performIndex(interactive: boolean) {
        console.log('Starting Vuex Store Indexing...');
        const storePath = await this.entryAnalyzer.analyze({ interactive });
        if (storePath) {
            this.lastStoreEntryPath = storePath;
            this.storeMap = await this.storeParser.parse(storePath);
            console.log('Store indexing completed.', 
                `State: ${this.storeMap.state.length}, `,
                `Getters: ${this.storeMap.getters.length}, `,
                `Mutations: ${this.storeMap.mutations.length}, `,
                `Actions: ${this.storeMap.actions.length}`
            );
        } else {
            // Avoid stale completion/definition results after store deletion/misconfiguration.
            this.lastStoreEntryPath = null;
            this.storeMap = null;
            console.log('No store injection found.');
        }
    }

    public shouldReindexForFile(filePath: string): boolean {
        const normalizedPath = vscode.Uri.file(filePath).fsPath;
        const lowerPath = normalizedPath.toLowerCase();

        // During cold start we have no graph yet; allow discovery.
        if (!this.storeMap) return true;

        if (this.storeParser.hasIndexedFile(normalizedPath)) return true;
        if (/(^|[\\/])(tsconfig|jsconfig)\.json$/.test(lowerPath)) return true;
        if (/(^|[\\/])src[\\/](main|index)\.(js|ts)$/.test(lowerPath)) return true;
        if (/[\\/]store[\\/]/.test(lowerPath)) return true;

        if (this.lastStoreEntryPath) {
            const normalizedEntry = vscode.Uri.file(this.lastStoreEntryPath).fsPath;
            if (normalizedPath === normalizedEntry) return true;
        }

        return false;
    }

    public getStoreMap(): VuexStoreMap | null {
        return this.storeMap;
    }

    // Helpers to find specific items
    // NOTE: This assumes 'namespaced: true' for all modules for simplicity in path construction
    // In a real robust app, we'd check the 'namespaced' flag for each level.
    // Here we implicitly joined namespaces in StoreParser.
    
    public getMutation(name: string): VuexMutationInfo | undefined {
        return this.storeMap?.mutations.find(m => {
             const fullName = [...m.modulePath, m.name].join('/');
             return fullName === name || m.name === name; // simple check
        });
    }

    public getAction(name: string): VuexActionInfo | undefined {
        return this.storeMap?.actions.find(a => {
             const fullName = [...a.modulePath, a.name].join('/');
             return fullName === name || a.name === name;
        });
    }

    // ... getters, state

    public getNamespace(filePath: string): string[] | undefined {
        return this.storeParser.getNamespace(filePath);
    }
}
