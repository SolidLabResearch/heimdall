import * as fs from 'fs';
import * as path from 'path';

export type SourcePodCredentials = Record<string, { id: string; secret: string; idp: string }>;
export type AggregationPodCredentials = { aggregation_pod_web_id: string; aggregation_pod_email: string; aggregation_pod_password: string };

function loadJson<T>(environmentVariable: string, defaultRelativePath: string, purpose: string): T {
    const filePath = process.env[environmentVariable] || path.resolve(process.cwd(), defaultRelativePath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${purpose}. Set ${environmentVariable} or copy ${defaultRelativePath.replace('.local.json', '.example.json')} to a local file.`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function loadSourcePodCredentials(): SourcePodCredentials {
    return loadJson('HEIMDALL_SOURCE_POD_CREDENTIALS_FILE', 'config/source-pod-credentials.local.json', 'source-Pod credentials');
}

/**
 * Source-Pod authentication is optional: public streams must not require a
 * local credential file. Invalid configured files still fail loudly.
 */
export function loadOptionalSourcePodCredentials(): SourcePodCredentials {
    const filePath = process.env.HEIMDALL_SOURCE_POD_CREDENTIALS_FILE || path.resolve(process.cwd(), 'config/source-pod-credentials.local.json');
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as SourcePodCredentials : {};
}

export function loadAggregationPodCredentials(): AggregationPodCredentials {
    return loadJson('HEIMDALL_AGGREGATION_POD_CREDENTIALS_FILE', 'config/aggregation-pod-credentials.local.json', 'aggregation-Pod credentials');
}

export function aggregationPodAccountFile(): string {
    return process.env.HEIMDALL_AGGREGATION_POD_ACCOUNT_FILE || path.resolve(process.cwd(), 'src/server/aggregator-pod/account.local.json');
}
