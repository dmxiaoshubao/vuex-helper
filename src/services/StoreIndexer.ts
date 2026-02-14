import * as vscode from 'vscode';
import { EntryAnalyzer } from './EntryAnalyzer';
import { StoreParser } from './StoreParser';
import { VuexStoreMap, VuexStateInfo, VuexGetterInfo, VuexMutationInfo, VuexActionInfo } from '../types';

export class StoreIndexer {
    private workspaceRoot: string;
    private entryAnalyzer: EntryAnalyzer;
    private storeParser: StoreParser;
    private storeMap: VuexStoreMap | null = null;
    private indexingPromise: Promise<void> | null = null;
    private rerunRequested = false;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.entryAnalyzer = new EntryAnalyzer(workspaceRoot);
        this.storeParser = new StoreParser(workspaceRoot);
    }

    public async index() {
        if (this.indexingPromise) {
            this.rerunRequested = true;
            return this.indexingPromise;
        }

        try {
            this.indexingPromise = this.performIndex();
            await this.indexingPromise;
            while (this.rerunRequested) {
                this.rerunRequested = false;
                this.indexingPromise = this.performIndex();
                await this.indexingPromise;
            }
        } finally {
            this.indexingPromise = null;
        }
    }

    private async performIndex() {
        console.log('Starting Vuex Store Indexing...');
        const storePath = await this.entryAnalyzer.analyze();
        if (storePath) {
            this.storeMap = await this.storeParser.parse(storePath);
            console.log('Store indexing completed.', 
                `State: ${this.storeMap.state.length}, `,
                `Getters: ${this.storeMap.getters.length}, `,
                `Mutations: ${this.storeMap.mutations.length}, `,
                `Actions: ${this.storeMap.actions.length}`
            );
        } else {
            console.log('No store injection found.');
        }
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
