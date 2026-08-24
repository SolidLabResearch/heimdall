import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRuntimeResources } from './Runtime';

describe('evaluation runtime resources', () => {
    it('uses the documented resource CSV schema including cpu_system', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-resource-'));
        const previous = process.env.HEIMDALL_RESULTS_DIR;
        process.env.HEIMDALL_RESULTS_DIR = directory;
        const runtime = createRuntimeResources({ streams: [] });
        await runtime.close();
        if (previous === undefined) delete process.env.HEIMDALL_RESULTS_DIR;
        else process.env.HEIMDALL_RESULTS_DIR = previous;
        const [header, row] = fs.readFileSync(path.join(directory, 'resource.csv'), 'utf8').trim().split('\n');
        expect(header).toBe('timestamp_epoch_ms,cpu_user_us,cpu_system_us,rss_bytes,heap_total_bytes,heap_used_bytes,external_bytes');
        expect(row.split(',')).toHaveLength(7);
    });
});
