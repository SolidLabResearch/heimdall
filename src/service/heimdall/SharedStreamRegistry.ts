import { turtleStringToStore } from '@treecg/ldes-snapshot';
import { DataFactory } from 'rdf-data-factory';
import { LDESinLDP, LDPCommunication } from '@treecg/versionawareldesinldp';
import { TREE } from '@treecg/versionawareldesinldp';
import { RDFStream } from 'rsp-js';
import { create_subscription, extract_ldp_inbox, extract_subscription_server } from '../../utils/notifications/Util';
import { MetricWriter } from '../../evaluation/MetricWriter';
import { SourcePodAccess } from './SourcePodAccess';

const DF = new DataFactory();

/* eslint-disable no-unused-vars -- ESLint does not distinguish TypeScript interface parameter names. */
export interface SharedStreamRegistryDependencies {
    resolveInbox(streamUrl: string): Promise<string>;
    createSubscription(streamUrl: string, inboxUrl: string): Promise<unknown>;
    readBucketStrategy(streamUrl: string): Promise<string>;
    fetchEvent(streamUrl: string, eventUrl: string): Promise<string>;
    parseEvent(turtle: string): Promise<any>;
}
/* eslint-enable no-unused-vars */

interface SharedStreamState {
    streamUrl: string;
    consumers: Map<string, RDFStream>;
    creation?: Promise<void>;
    bucketStrategy?: string;
    inboxUrl?: string;
    /** The helper currently returns response text, not a deletion-capable URL. */
    subscriptionHandle?: unknown;
}

/**
 * Service-owned live-stream acquisition. Query executions only own memberships
 * in this registry; they never own the remote Solid subscription.
 */
export class SharedStreamRegistry {
    private readonly streams = new Map<string, SharedStreamState>();
    private readonly dependencies: SharedStreamRegistryDependencies;
    private readonly logger: any;
    private readonly metricWriter: MetricWriter;
    public readonly sourcePodAccess: SourcePodAccess;

    public constructor(
        logger: any,
        metricWriter: MetricWriter = new MetricWriter(),
        dependencies: Partial<SharedStreamRegistryDependencies> = {},
        sourcePodAccess: SourcePodAccess = new SourcePodAccess(),
    ) {
        this.logger = logger;
        this.metricWriter = metricWriter;
        this.sourcePodAccess = sourcePodAccess;
        this.dependencies = {
            resolveInbox: async (streamUrl) => {
                const inbox = await extract_ldp_inbox(streamUrl, undefined, await this.sourcePodAccess.fetchFor(streamUrl));
                if (!inbox) throw new Error(`No LDP inbox found for stream ${streamUrl}`);
                return inbox;
            },
            createSubscription: this.createPhysicalSubscription.bind(this),
            readBucketStrategy: this.readBucketStrategy.bind(this),
            fetchEvent: this.fetchEvent.bind(this),
            parseEvent: turtleStringToStore,
            ...dependencies,
        };
    }

    public static canonicalStreamUrl(streamUrl: string): string {
        try {
            return new URL(streamUrl).toString();
        } catch (_) {
            // Preserve an existing non-URL identifier rather than applying a
            // lossy normalization which could merge distinct streams.
            return streamUrl;
        }
    }

    public async attach(streamUrl: string, executionId: string, rdfStream: RDFStream): Promise<void> {
        const key = SharedStreamRegistry.canonicalStreamUrl(streamUrl);
        let state = this.streams.get(key);
        const reused = state !== undefined;
        if (!state) {
            state = { streamUrl: key, consumers: new Map() };
            this.streams.set(key, state);
            state.creation = this.initialize(key, state);
        }

        if (!state.consumers.has(executionId)) {
            state.consumers.set(executionId, rdfStream);
            this.metricWriter.record('initialization.csv', 'query_stream_membership_created', {
                query_id: executionId,
                stream_id: key,
            });
        }
        if (reused) {
            this.metricWriter.record('initialization.csv', 'physical_stream_subscription_reused', {
                query_id: executionId,
                stream_id: key,
            });
        }
        await state.creation;
    }

    public detach(streamUrl: string, executionId: string): boolean {
        const key = SharedStreamRegistry.canonicalStreamUrl(streamUrl);
        const state = this.streams.get(key);
        if (!state || !state.consumers.delete(executionId)) return false;
        this.metricWriter.record('initialization.csv', 'query_stream_membership_removed', { query_id: executionId, stream_id: key });
        // The notification helper does not expose a remote subscription URI,
        // so final-consumer remote deletion cannot be implemented safely yet.
        // Retaining the state makes a later reattach reuse the acquisition.
        return true;
    }

    public consumerCount(streamUrl: string): number {
        return this.streams.get(SharedStreamRegistry.canonicalStreamUrl(streamUrl))?.consumers.size || 0;
    }

    public physicalStreamCount(): number { return this.streams.size; }

    public async handleNotification(streamUrl: string, eventUrl: string): Promise<void> {
        const key = SharedStreamRegistry.canonicalStreamUrl(streamUrl);
        const state = this.streams.get(key);
        if (!state) {
            this.logger.warn?.({ stream_id: key, event_id: eventUrl }, 'notification_for_unregistered_stream');
            return;
        }
        await state.creation;
        const retrievalStartEpochMs = Date.now();
        const retrievalStartMonotonicNs = process.hrtime.bigint();
        const turtle = await this.dependencies.fetchEvent(key, eventUrl);
        this.metricWriter.timed('event-processing.csv', 'event_retrieval', { event_id: eventUrl, stream_id: key }, retrievalStartEpochMs, retrievalStartMonotonicNs);

        const parsingStartEpochMs = Date.now();
        const parsingStartMonotonicNs = process.hrtime.bigint();
        const eventStore = await this.dependencies.parseEvent(turtle);
        const timestampValue = eventStore.getQuads(null, DF.namedNode(state.bucketStrategy!), null, null)[0]?.object.value;
        if (!timestampValue) throw new Error(`No event timestamp found for stream ${key}`);
        const timestamp = Date.parse(timestampValue);
        this.metricWriter.timed('event-processing.csv', 'parsing_timestamp_extraction', { event_id: eventUrl, stream_id: key }, parsingStartEpochMs, parsingStartMonotonicNs);

        const quads = new Set(eventStore.getQuads(null, null, null, null));
        for (const rdfStream of Array.from(state.consumers.values())) {
            rdfStream.add(quads, timestamp, eventUrl);
        }
    }

    /** Route a webhook target (an inbox member) to its registered LDES stream. */
    public async handleNotificationTarget(targetUrl: string, eventUrl: string): Promise<void> {
        const state = Array.from(this.streams.values()).find(candidate => candidate.inboxUrl && targetUrl.startsWith(candidate.inboxUrl));
        if (!state) {
            this.logger.warn?.({ target_id: targetUrl, event_id: eventUrl }, 'notification_for_unregistered_inbox');
            return;
        }
        await this.handleNotification(state.streamUrl, eventUrl);
    }

    private async initialize(key: string, state: SharedStreamState): Promise<void> {
        try {
            // Resolve metadata before mutating the remote subscription server;
            // a metadata failure therefore leaves no remote side effect.
            const [bucketStrategy, inboxUrl] = await Promise.all([
                this.dependencies.readBucketStrategy(key),
                this.dependencies.resolveInbox(key),
            ]);
            const subscriptionHandle = await this.dependencies.createSubscription(key, inboxUrl);
            state.bucketStrategy = bucketStrategy;
            state.inboxUrl = inboxUrl;
            state.subscriptionHandle = subscriptionHandle;
            this.metricWriter.record('initialization.csv', 'physical_stream_subscription_created', { stream_id: key });
            this.logger.info({}, 'physical_stream_subscription_created');
        } catch (error) {
            // Only remove this exact failed state: callers awaiting it fail,
            // while a later attach starts a fresh creation attempt.
            if (this.streams.get(key) === state) this.streams.delete(key);
            throw error;
        }
    }

    private async createPhysicalSubscription(streamUrl: string, inbox: string): Promise<unknown> {
        const server = await extract_subscription_server(inbox, undefined, await this.sourcePodAccess.fetchFor(inbox, streamUrl));
        if (!server) throw new Error(`No subscription server found for stream ${streamUrl}`);
        return create_subscription(server.location, inbox, undefined, await this.sourcePodAccess.fetchFor(server.location, streamUrl));
    }

    private async readBucketStrategy(streamUrl: string): Promise<string> {
        const ldes = new LDESinLDP(streamUrl, await this.sourcePodAccess.communicationFor(streamUrl));
        const metadata = await ldes.readMetadata();
        const quad = metadata.getQuads(streamUrl + '#BucketizeStrategy', TREE.path, null, null)[0];
        if (!quad) throw new Error(`No bucket strategy found for stream ${streamUrl}`);
        return quad.object.value;
    }

    private async fetchEvent(streamUrl: string, eventUrl: string): Promise<string> {
        const response = await (await this.sourcePodAccess.fetchFor(eventUrl, streamUrl))(eventUrl, { method: 'GET', headers: { Accept: 'text/turtle' } });
        return response.text();
    }
}
