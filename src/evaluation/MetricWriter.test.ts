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

    it('keeps structured RSP metrics active when diagnostic logging is disabled', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-metrics-disabled-'));
        const previous = process.env.RSP_JS_DISABLE_LOGGING;
        process.env.RSP_JS_DISABLE_LOGGING = '1';
        try {
            const writer = new MetricWriter(directory, 'run-disabled', 'heimdall');
            writer.record('event-processing.csv', 'rsp_insertion');
            writer.record('out-of-order.csv', 'out_of_order_event');
            writer.record('window-processing.csv', 'window_query_processing');
            writer.record('window-processing.csv', 'r2r_first_result');
            const metrics = fs.readFileSync(path.join(directory, 'window-processing.csv'), 'utf8');
            expect(metrics).toContain('window_query_processing');
            expect(metrics).toContain('r2r_first_result');
            expect(fs.readFileSync(path.join(directory, 'event-processing.csv'), 'utf8')).toContain('rsp_insertion');
            expect(fs.readFileSync(path.join(directory, 'out-of-order.csv'), 'utf8')).toContain('out_of_order_event');
        } finally {
            if (previous === undefined) delete process.env.RSP_JS_DISABLE_LOGGING;
            else process.env.RSP_JS_DISABLE_LOGGING = previous;
        }
    });
});
