import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetricWriter } from './MetricWriter';

describe('evaluation metric writer', () => {
    it('writes one consistent raw schema without aggregating observations', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-metrics-'));
        const writer = new MetricWriter(directory, 'run-a', 'heimdall');
        const start = process.hrtime.bigint();
        writer.timed('initialization.csv', 'query_reuse_check', { query_id: 'query-a' }, Date.now(), start);
        const lines = fs.readFileSync(path.join(directory, 'initialization.csv'), 'utf8').trim().split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('start_monotonic_ns');
        expect(lines[0]).toContain('duration_ms');
        expect(lines[1]).toContain('query_reuse_check');
        expect(lines[1]).toContain('run-a');
    });
});
