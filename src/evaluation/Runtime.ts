import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MetricWriter } from './MetricWriter';

export interface RuntimeResources {
    writer: MetricWriter;
    logger: any;
    resourceTimer?: NodeJS.Timeout;
    close: () => Promise<void>;
}

export function createRuntimeResources(logger: any): RuntimeResources {
    const writer = new MetricWriter();
    if (!writer.enabled) return { writer, logger, close: async () => undefined };
    const resourceFile = path.join(writer.resultsDir, 'resource.csv');
    if (fs.existsSync(resourceFile)) throw new Error(`Refusing to overwrite evaluation output: ${resourceFile}. Use a new HEIMDALL_RESULTS_DIR for each run.`);
    fs.writeFileSync(resourceFile, 'timestamp_epoch_ms,cpu_user_us,cpu_system_us,rss_bytes,heap_total_bytes,heap_used_bytes,external_bytes\n');
    const interval = parseInterval(process.env.HEIMDALL_RESOURCE_INTERVAL_MS);
    const sample = () => {
        const cpu = process.cpuUsage();
        const memory = process.memoryUsage();
        fs.appendFileSync(resourceFile, `${Date.now()},${cpu.user},${cpu.system},${memory.rss},${memory.heapTotal},${memory.heapUsed},${memory.external}\n`);
    };
    sample();
    const resourceTimer = setInterval(sample, interval);
    writeRspMetadata(writer);
    let closed = false;
    return {
        writer,
        logger,
        resourceTimer,
        close: async () => {
            if (closed) return;
            closed = true;
            clearInterval(resourceTimer);
            const streams = logger.streams || [];
            await Promise.all(streams.map((entry: any) => new Promise<void>(resolve => {
                if (entry.stream && typeof entry.stream.end === 'function') entry.stream.end(resolve);
                else resolve();
            })));
        },
    };
}

function parseInterval(value: string | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

function writeRspMetadata(writer: MetricWriter): void {
    const dependencyPath = process.env.HEIMDALL_RSP_JS_PATH || path.resolve(__dirname, '../../node_modules/rsp-js');
    let commit = 'unavailable';
    let dirty = 'unknown';
    try {
        commit = childProcess.execFileSync('git', ['-C', dependencyPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        dirty = childProcess.execFileSync('git', ['-C', dependencyPath, 'status', '--porcelain'], { encoding: 'utf8' }).trim() ? 'true' : 'false';
    } catch (_) { /* packaged dependencies may not retain .git metadata */ }
    fs.writeFileSync(path.join(writer.resultsDir, 'run-metadata.json'), JSON.stringify({
        run_id: writer.runId,
        approach: writer.approach,
        rsp_js_path: dependencyPath,
        rsp_js_commit: commit,
        rsp_js_dirty: dirty,
    }, null, 2) + '\n');
}
