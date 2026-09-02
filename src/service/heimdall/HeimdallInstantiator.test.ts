import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetricWriter } from '../../evaluation/MetricWriter';
import { HeimdallInstantiator } from './HeimdallInstantiator';

describe('heimdall_instantiator', () => {
    it('routes RSP-JS metrics to their existing evaluation files', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-instantiator-metrics-'));
        const writer = new MetricWriter(directory, 'run-a', 'heimdall');
        const instantiator = new HeimdallInstantiator(
            'SELECT * WHERE { ?s ?p ?o }',
            0,
            1,
            { info: jest.fn() },
            'live',
            {},
            '',
            writer,
            'client-a',
        );
        const metric = {
            query_id: 'query-a',
            window_id: 'window-a',
            window_from_ms: 1000,
            window_to_ms: 2000,
            window_size: 2,
            start_monotonic_ns: '10',
            end_monotonic_ns: '20',
            duration_ms: 0.00001,
        };
        const testEngine = instantiator.rsp_engine as unknown as { emitMetric: (event: string, metric: object) => void };

        testEngine.emitMetric('r2r_first_result', metric);
        testEngine.emitMetric('window_query_processing', metric);
        testEngine.emitMetric('rsp_insertion', { event_id: 'event-a' });
        testEngine.emitMetric('out_of_order_event', { event_id: 'event-a' });

        const rowFor = (file: string, operation: string): string[] => {
            const lines = fs.readFileSync(path.join(directory, file), 'utf8').trim().split('\n');
            const columns = lines[0].split(',');
            return lines.slice(1).map((line) => line.split(',')).find((row) => row[columns.indexOf('operation')] === operation) || [];
        };

        const firstResultRow = rowFor('window-processing.csv', 'r2r_first_result');
        expect(firstResultRow).not.toHaveLength(0);
        expect(firstResultRow[firstResultRow.length - 1]).toBe('2');
        expect(rowFor('window-processing.csv', 'window_query_processing')).not.toHaveLength(0);
        expect(rowFor('event-processing.csv', 'rsp_insertion')).not.toHaveLength(0);
        expect(rowFor('out-of-order.csv', 'out_of_order_event')).not.toHaveLength(0);
    });
});
