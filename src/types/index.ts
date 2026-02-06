import * as vscode from 'vscode';

export interface VuexStateInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
    documentation?: string;
    displayType?: string; // e.g. "string", "number", "Array", "Object"
}

export interface VuexGetterInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
    documentation?: string;
}

export interface VuexMutationInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
    documentation?: string;
}

export interface VuexActionInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
    documentation?: string;
}

export interface VuexStoreMap {
    state: VuexStateInfo[];
    getters: VuexGetterInfo[];
    mutations: VuexMutationInfo[];
    actions: VuexActionInfo[];
}
