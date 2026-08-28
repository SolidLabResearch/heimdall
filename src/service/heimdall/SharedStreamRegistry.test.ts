import { SharedStreamRegistry } from './SharedStreamRegistry';
import { MetricWriter } from '../../evaluation/MetricWriter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const streams = ['http://example.test/A/', 'http://example.test/B/', 'http://example.test/C/'];

describe('SharedStreamRegistry', () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    const fakeRdfStream = () => ({ add: jest.fn() } as any);
    const makeRegistry = (overrides: Record<string, any> = {}) => {
        const dependencies = {
            createSubscription: jest.fn().mockResolvedValue('subscription'),
            readBucketStrategy: jest.fn().mockResolvedValue('http://example.test/time'),
            fetchEvent: jest.fn().mockResolvedValue('event'),
            parseEvent: jest.fn().mockResolvedValue({
                getQuads: (_subject: any, predicate: any) => predicate ? [{ object: { value: '2026-01-01T00:00:00.000Z' } }] : [{ subject: 'event' }],
            }),
            ...overrides,
        };
        return { registry: new SharedStreamRegistry(logger, undefined, dependencies), dependencies };
    };

    it('creates three physical subscriptions and memberships for one execution', async () => {
        const { registry, dependencies } = makeRegistry();
        await Promise.all(streams.map((stream) => registry.attach(stream, 'Q1', fakeRdfStream())));
        expect(registry.physicalStreamCount()).toBe(3);
        expect(streams.map((stream) => registry.consumerCount(stream))).toEqual([1, 1, 1]);
        expect(dependencies.createSubscription).toHaveBeenCalledTimes(3);
    });

    it('keeps one membership for equivalent client registrations of one execution', async () => {
        const { registry, dependencies } = makeRegistry();
        await registry.attach(streams[0], 'Qshared', fakeRdfStream());
        await registry.attach(streams[0], 'Qshared', fakeRdfStream());
        expect(registry.consumerCount(streams[0])).toBe(1);
        expect(dependencies.createSubscription).toHaveBeenCalledTimes(1);
    });

    it('shares acquisition and parsing but fans one event out once to each non-equivalent execution', async () => {
        const { registry, dependencies } = makeRegistry();
        const consumers = [fakeRdfStream(), fakeRdfStream(), fakeRdfStream()];
        await Promise.all(consumers.map((consumer, index) => registry.attach(streams[0], `Q${index + 1}`, consumer)));
        await registry.handleNotification(streams[0], 'http://example.test/event-1');
        expect(dependencies.createSubscription).toHaveBeenCalledTimes(1);
        expect(dependencies.fetchEvent).toHaveBeenCalledTimes(1);
        expect(dependencies.parseEvent).toHaveBeenCalledTimes(1);
        consumers.forEach((consumer) => expect(consumer.add).toHaveBeenCalledTimes(1));
    });

    it('does not share three executions with completely disjoint streams', async () => {
        const { registry, dependencies } = makeRegistry();
        await Promise.all([
            ...['A', 'B', 'C'].map((name) => registry.attach(`http://example.test/${name}/`, 'Q1', fakeRdfStream())),
            ...['D', 'E', 'F'].map((name) => registry.attach(`http://example.test/${name}/`, 'Q2', fakeRdfStream())),
            ...['G', 'H', 'I'].map((name) => registry.attach(`http://example.test/${name}/`, 'Q3', fakeRdfStream())),
        ]);
        expect(registry.physicalStreamCount()).toBe(9);
        expect(dependencies.createSubscription).toHaveBeenCalledTimes(9);
    });

    it('shares only the partial stream overlap', async () => {
        const { registry, dependencies } = makeRegistry();
        await Promise.all([
            ...['A', 'B', 'C'].map((name) => registry.attach(`http://example.test/${name}/`, 'Q1', fakeRdfStream())),
            ...['A', 'B', 'D'].map((name) => registry.attach(`http://example.test/${name}/`, 'Q2', fakeRdfStream())),
        ]);
        expect(registry.physicalStreamCount()).toBe(4);
        expect(['A', 'B', 'C', 'D'].map((name) => registry.consumerCount(`http://example.test/${name}/`))).toEqual([2, 2, 1, 1]);
        expect(dependencies.createSubscription).toHaveBeenCalledTimes(4);
    });

    it('uses one pending creation promise for concurrent attachments', async () => {
        let resolveCreation: (() => void) | undefined;
        const creation = new Promise<void>((resolve) => { resolveCreation = resolve; });
        const { registry, dependencies } = makeRegistry({ createSubscription: jest.fn().mockReturnValue(creation) });
        const attachments = Array.from({ length: 5 }, (_, index) => registry.attach(streams[0], `Q${index}`, fakeRdfStream()));
        await Promise.resolve();
        expect(dependencies.createSubscription).toHaveBeenCalledTimes(1);
        resolveCreation!();
        await Promise.all(attachments);
        expect(registry.consumerCount(streams[0])).toBe(5);
    });

    it('rolls back a failed creation so a later attach retries', async () => {
        const createSubscription = jest.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce('subscription');
        const { registry } = makeRegistry({ createSubscription });
        await expect(registry.attach(streams[0], 'Q1', fakeRdfStream())).rejects.toThrow('failed');
        expect(registry.physicalStreamCount()).toBe(0);
        await registry.attach(streams[0], 'Q1', fakeRdfStream());
        expect(createSubscription).toHaveBeenCalledTimes(2);
        expect(registry.consumerCount(streams[0])).toBe(1);
    });

    it('removes memberships locally without inventing remote subscription deletion', async () => {
        const { registry } = makeRegistry();
        await Promise.all(['Q1', 'Q2', 'Q3'].map((id) => registry.attach(streams[0], id, fakeRdfStream())));
        expect(registry.detach(streams[0], 'Q2')).toBe(true);
        expect(registry.consumerCount(streams[0])).toBe(2);
        registry.detach(streams[0], 'Q1');
        registry.detach(streams[0], 'Q3');
        expect(registry.consumerCount(streams[0])).toBe(0);
        expect(registry.physicalStreamCount()).toBe(1);
    });

    it('does not deduplicate duplicate upstream notifications', async () => {
        const { registry, dependencies } = makeRegistry();
        const consumer = fakeRdfStream();
        await registry.attach(streams[0], 'Q1', consumer);
        await registry.handleNotification(streams[0], 'http://example.test/event-1');
        await registry.handleNotification(streams[0], 'http://example.test/event-1');
        expect(dependencies.fetchEvent).toHaveBeenCalledTimes(2);
        expect(consumer.add).toHaveBeenCalledTimes(2);
    });

    it('records physical subscriptions separately from execution memberships', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-stream-metrics-'));
        const { dependencies } = makeRegistry();
        const registry = new SharedStreamRegistry(logger, new MetricWriter(directory, 'run-a', 'heimdall'), dependencies);
        await registry.attach(streams[0], 'Q1', fakeRdfStream());
        await registry.attach(streams[0], 'Q2', fakeRdfStream());
        const rows = fs.readFileSync(path.join(directory, 'initialization.csv'), 'utf8');
        expect(rows.match(/physical_stream_subscription_created/g)).toHaveLength(1);
        expect(rows.match(/physical_stream_subscription_reused/g)).toHaveLength(1);
        expect(rows.match(/query_stream_membership_created/g)).toHaveLength(2);
    });
});
