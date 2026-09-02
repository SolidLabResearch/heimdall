import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';
import { createRuntimeResources, REQUIRED_RSP_JS_REVISION, runtimeResourceSample } from './Runtime';

describe('evaluation runtime resources', () => {
    it('uses the documented resource CSV schema including derived CPU utilization', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-resource-'));
        const previous = process.env.HEIMDALL_RESULTS_DIR;
        process.env.HEIMDALL_RESULTS_DIR = directory;
        const runtime = createRuntimeResources({ streams: [] });
        await runtime.close();
        if (previous === undefined) delete process.env.HEIMDALL_RESULTS_DIR;
        else process.env.HEIMDALL_RESULTS_DIR = previous;
        const [header, row] = fs.readFileSync(path.join(directory, 'resource.csv'), 'utf8').trim().split('\n');
        expect(header).toBe('timestamp_epoch_ms,cpu_user_us,cpu_system_us,rss_bytes,heap_total_bytes,heap_used_bytes,external_bytes,cpu_user_delta_us,cpu_system_delta_us,wall_delta_us,cpu_utilization_percent');
        expect(row.split(',')).toHaveLength(11);
        expect(row.split(',').slice(7)).toEqual(['', '', '', '']);
    });

    it('retains cumulative CPU/RSS values and derives CPU utilization from monotonic microseconds', () => {
        const memory = { rss: 4096, heapTotal: 2048, heapUsed: 1024, external: 512, arrayBuffers: 0 };
        const firstWall = BigInt(1_000_000);
        const second = runtimeResourceSample({ user: 30, system: 15 }, memory, BigInt(1_500_000), { cpu: { user: 10, system: 5 }, wall: firstWall });
        const first = runtimeResourceSample({ user: 10, system: 5 }, memory, firstWall);
        expect(first).toMatchObject({ cpuUserUs: 10, cpuSystemUs: 5, rssBytes: 4096, cpuUserDeltaUs: '', cpuSystemDeltaUs: '', wallDeltaUs: '', cpuUtilizationPercent: '' });
        expect(second).toMatchObject({ cpuUserUs: 30, cpuSystemUs: 15, rssBytes: 4096, cpuUserDeltaUs: 20, cpuSystemDeltaUs: 10, wallDeltaUs: 500, cpuUtilizationPercent: 6 });
    });

    it('resolves the pinned rsp-js package with benchmark logging control support', () => {
        const resolved = childProcess.execFileSync('node', ['-e', 'process.stdout.write(require.resolve("rsp-js"))'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim();
        const expectedRoot = fs.realpathSync(path.resolve(__dirname, '../../node_modules/rsp-js'));
        expect(resolved.startsWith(`${expectedRoot}${path.sep}`)).toBe(true);
        expect(fs.readFileSync(path.join(expectedRoot, 'dist', 'util', 'Logger.js'), 'utf8')).toContain('RSP_JS_DISABLE_LOGGING');
        expect(REQUIRED_RSP_JS_REVISION).toBe('56e773d8416f978d82a8288802532cabdf8ffef6');
    });
});
