import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { aggregationPodAccountFile, loadAggregationPodCredentials, loadSourcePodCredentials } from './privateCredentials';

describe('private credential configuration', () => {
    const previousSource = process.env.HEIMDALL_SOURCE_POD_CREDENTIALS_FILE;
    const previousAggregation = process.env.HEIMDALL_AGGREGATION_POD_CREDENTIALS_FILE;
    const previousAccount = process.env.HEIMDALL_AGGREGATION_POD_ACCOUNT_FILE;

    afterEach(() => {
        if (previousSource === undefined) delete process.env.HEIMDALL_SOURCE_POD_CREDENTIALS_FILE;
        else process.env.HEIMDALL_SOURCE_POD_CREDENTIALS_FILE = previousSource;
        if (previousAggregation === undefined) delete process.env.HEIMDALL_AGGREGATION_POD_CREDENTIALS_FILE;
        else process.env.HEIMDALL_AGGREGATION_POD_CREDENTIALS_FILE = previousAggregation;
        if (previousAccount === undefined) delete process.env.HEIMDALL_AGGREGATION_POD_ACCOUNT_FILE;
        else process.env.HEIMDALL_AGGREGATION_POD_ACCOUNT_FILE = previousAccount;
    });

    it('loads source and aggregation credentials only from explicitly configured local files', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-credentials-'));
        const sourcePath = path.join(directory, 'source.json');
        const aggregationPath = path.join(directory, 'aggregation.json');
        fs.writeFileSync(sourcePath, JSON.stringify({ 'https://pod.example/stream/': { id: 'test-id', secret: 'test-secret', idp: 'https://issuer.example/' } }));
        fs.writeFileSync(aggregationPath, JSON.stringify({ aggregation_pod_web_id: 'https://pod.example/#me', aggregation_pod_email: 'test@example.test', aggregation_pod_password: 'test-password' }));
        process.env.HEIMDALL_SOURCE_POD_CREDENTIALS_FILE = sourcePath;
        process.env.HEIMDALL_AGGREGATION_POD_CREDENTIALS_FILE = aggregationPath;
        process.env.HEIMDALL_AGGREGATION_POD_ACCOUNT_FILE = path.join(directory, 'account.json');

        expect(loadSourcePodCredentials()['https://pod.example/stream/'].id).toBe('test-id');
        expect(loadAggregationPodCredentials().aggregation_pod_email).toBe('test@example.test');
        expect(aggregationPodAccountFile()).toBe(path.join(directory, 'account.json'));
    });

    it('fails clearly when historical source credentials are not configured', () => {
        delete process.env.HEIMDALL_SOURCE_POD_CREDENTIALS_FILE;
        expect(() => loadSourcePodCredentials()).toThrow('Missing source-Pod credentials');
    });
});
