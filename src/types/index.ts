import * as vscode from 'vscode';

export interface VuexStateInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
}

export interface VuexGetterInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
}

export interface VuexMutationInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
}

export interface VuexActionInfo {
    name: string;
    defLocation: vscode.Location;
    modulePath: string[];
}

export interface VuexStoreMap {
    state: VuexStateInfo[];
    getters: VuexGetterInfo[];
    mutations: VuexMutationInfo[];
    actions: VuexActionInfo[];
}
