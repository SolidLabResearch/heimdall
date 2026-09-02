import { performance } from 'node:perf_hooks';
import { find_relevant_streams, DiscoveryTimingObserver } from '../utils/Util';
import { extract_ldp_inbox, extract_subscription_server, create_subscription, NotificationTimingObserver } from '../utils/notifications/Util';

export interface InitializationTimingResult {
    system: 'heimdall'; resolved_stream: string; public_type_index_discovery_ms: number;
    relevant_stream_discovery_ms: number; stream_discovery_total_ms: number; inbox_discovery_ms: number;
    subscription_server_discovery_ms: number; webhook_subscription_creation_ms: number;
    notification_subscription_total_ms: number; discovery_and_subscription_total_ms: number;
    subscription_channel?: string; success: boolean; error?: string;
}
const elapsed = (start: number, end: number): number => Math.max(0, end - start);
const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`Missing required benchmark configuration: ${name}`); return value; };

export async function runInitializationBenchmarkOnce(): Promise<InitializationTimingResult> {
    const pod = required('BENCHMARK_POD_URL');
    const metric = required('BENCHMARK_METRIC_URI');
    const timings: any = {}; let typeIndexCount = 0; let discoveryStart = 0; let dTotalStart = performance.now();
    const discoveryObserver: DiscoveryTimingObserver = {
        publicTypeIndexStart: () => { if (typeIndexCount === 0) discoveryStart = performance.now(); },
        publicTypeIndexEnd: () => { if (typeIndexCount++ === 0) { timings.d1End = performance.now(); timings.d2Start = timings.d1End; } },
        relevantStreamsEnd: () => { timings.d2End = performance.now(); },
    };
    const notificationObserver: NotificationTimingObserver = {
        inboxStart: () => { timings.s1Start = performance.now(); }, inboxEnd: () => { timings.s1End = performance.now(); },
        subscriptionServerStart: () => { timings.s2Start = performance.now(); }, subscriptionServerEnd: () => { timings.s2End = performance.now(); },
        subscriptionCreationStart: () => { timings.s3Start = performance.now(); }, subscriptionResponse: (ok, channel) => { timings.s3End = performance.now(); timings.ok = ok; timings.channel = channel; },
    };
    try {
        dTotalStart = performance.now();
        const streams = await find_relevant_streams(pod, [metric], discoveryObserver);
        const stream = streams[0]; if (!stream) throw new Error('No relevant LDES stream found.');
        const dTotalEnd = performance.now();
        const inbox = await extract_ldp_inbox(stream, notificationObserver); if (!inbox) throw new Error('No LDP inbox found.');
        const server = await extract_subscription_server(inbox, notificationObserver); if (!server) throw new Error('No subscription server found.');
        const response = await create_subscription(server.location, inbox, notificationObserver);
        if (!timings.ok || !response) throw new Error('Webhook subscription did not return a successful response.');
        const totalEnd = performance.now();
        let channel: string | undefined; try { const parsed = JSON.parse(response); channel = parsed.id || parsed.channel || parsed['@id']; } catch { /* current helper returns opaque response text */ }
        return { system: 'heimdall', resolved_stream: stream, public_type_index_discovery_ms: elapsed(discoveryStart, timings.d1End), relevant_stream_discovery_ms: elapsed(timings.d2Start, timings.d2End), stream_discovery_total_ms: elapsed(dTotalStart, dTotalEnd), inbox_discovery_ms: elapsed(timings.s1Start, timings.s1End), subscription_server_discovery_ms: elapsed(timings.s2Start, timings.s2End), webhook_subscription_creation_ms: elapsed(timings.s3Start, timings.s3End), notification_subscription_total_ms: elapsed(timings.s1Start, timings.s3End), discovery_and_subscription_total_ms: elapsed(dTotalStart, totalEnd), subscription_channel: channel, success: true };
    } catch (error) {
        return { system: 'heimdall', resolved_stream: '', public_type_index_discovery_ms: 0, relevant_stream_discovery_ms: 0, stream_discovery_total_ms: 0, inbox_discovery_ms: 0, subscription_server_discovery_ms: 0, webhook_subscription_creation_ms: 0, notification_subscription_total_ms: 0, discovery_and_subscription_total_ms: elapsed(dTotalStart, performance.now()), success: false, error: (error as Error).message };
    }
}

if (require.main === module) runInitializationBenchmarkOnce().then(result => console.log(`BENCHMARK_RESULT=${JSON.stringify(result)}`));
