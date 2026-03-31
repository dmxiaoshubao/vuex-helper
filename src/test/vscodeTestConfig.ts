export const DEFAULT_VSCODE_TEST_VERSION = '1.113.0';

export function resolveVSCodeTestVersion(...envKeys: string[]): string {
    for (const envKey of envKeys) {
        const value = process.env[envKey]?.trim();
        if (value) {
            return value;
        }
    }
    return DEFAULT_VSCODE_TEST_VERSION;
}
