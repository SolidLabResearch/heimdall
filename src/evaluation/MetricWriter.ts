import * as fs from 'fs';
import * as path from 'path';

export type MetricFields = Record<string, string | number | boolean | undefined>;

const COLUMNS = [
    'run_id', 'approach', 'client_id', 'query_id', 'event_id', 'stream_id', 'operation',
    'start_epoch_ms', 'end_epoch_ms', 'duration_ms', 'start_monotonic_ns', 'end_monotonic_ns',
    'message_id', 'result_id', 'server_send_epoch_ms', 'event_time_ms', 'reference_time_ms',
    'out_of_order', 'lateness_ms', 'max_out_of_orderness_ms', 'within_bound', 'window_id',
    'window_from_ms', 'window_to_ms', 'window_size',
];

/** Writes raw, one-row-per-observation evaluation measurements. */
export class MetricWriter {
    public readonly resultsDir: string;
    public readonly runId: string;
    public readonly approach: string;
    public readonly clientId: string;
    public readonly enabled: boolean;

    constructor(resultsDir = process.env.HEIMDALL_RESULTS_DIR, runId = process.env.HEIMDALL_RUN_ID || 'unspecified', approach = process.env.HEIMDALL_APPROACH || 'heimdall') {
        this.enabled = Boolean(resultsDir);
        this.resultsDir = path.resolve(resultsDir || '.');
        this.runId = runId;
        this.approach = approach;
        this.clientId = process.env.HEIMDALL_CLIENT_ID || 'unspecified';
        if (!this.enabled) return;
        fs.mkdirSync(this.resultsDir, { recursive: true });
        for (const file of ['initialization.csv', 'event-processing.csv', 'window-processing.csv', 'result-dispatch.csv', 'out-of-order.csv']) {
            const destination = path.join(this.resultsDir, file);
            if (!fs.existsSync(destination)) {
                fs.writeFileSync(destination, `${COLUMNS.join(',')}\n`);
            } else if (fs.statSync(destination).size > 0) {
                throw new Error(`Refusing to overwrite evaluation output: ${destination}. Use a new HEIMDALL_RESULTS_DIR for each run.`);
            }
        }
    }

    public record(file: 'initialization.csv' | 'event-processing.csv' | 'window-processing.csv' | 'result-dispatch.csv' | 'out-of-order.csv', operation: string, fields: MetricFields = {}): void {
        if (!this.enabled) return;
        const row: MetricFields = { run_id: this.runId, approach: this.approach, client_id: this.clientId, operation, ...fields };
        fs.appendFileSync(path.join(this.resultsDir, file), `${COLUMNS.map(column => csv(row[column])).join(',')}\n`);
    }

    public timed(file: 'initialization.csv' | 'event-processing.csv' | 'window-processing.csv' | 'result-dispatch.csv' | 'out-of-order.csv', operation: string, fields: MetricFields, startEpochMs: number, startMonotonicNs: bigint): void {
        const endMonotonicNs = process.hrtime.bigint();
        const endEpochMs = Date.now();
        this.record(file, operation, {
            ...fields,
            start_epoch_ms: startEpochMs,
            end_epoch_ms: endEpochMs,
            duration_ms: Number(endMonotonicNs - startMonotonicNs) / 1_000_000,
            start_monotonic_ns: startMonotonicNs.toString(),
            end_monotonic_ns: endMonotonicNs.toString(),
        });
    }
}

function csv(value: MetricFields[string]): string {
    if (value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
