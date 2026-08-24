import { HEIMDALL_WEBSOCKET_PROTOCOL, LEGACY_WEBSOCKET_PROTOCOL, resolveAcceptedWebSocketProtocol } from './websocketProtocols';
import { EventEmitter } from 'events';
import { WebSocketHandler } from './WebSocketHandler';
import { MetricWriter } from '../evaluation/MetricWriter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('WebSocketHandler compatibility', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return { ok: true, json: async () => ({}), text: async () => '' } as Response;
    });

    afterAll(() => fetchSpy.mockRestore());

    const createEvaluationHandler = () => {
        const events = new EventEmitter();
        const websocketServer = new EventEmitter() as any;
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-evaluation-'));
        const handler = new WebSocketHandler(
            websocketServer,
            events,
            undefined,
            { info: jest.fn(), debug: jest.fn() },
            new MetricWriter(directory),
        );
        handler.handle_wss();

        return { handler, websocketServer };
    };

    const sendEvaluationQuery = async (handler: WebSocketHandler, websocketServer: EventEmitter, message: object) => {
        const connection = new EventEmitter() as any;
        connection.send = jest.fn();
        const request = {
            requestedProtocols: [HEIMDALL_WEBSOCKET_PROTOCOL],
            origin: 'http://example.test',
            accept: jest.fn(() => connection),
        };
        const requestHandler = websocketServer.listeners('request')[0] as any;
        await requestHandler(request);
        const messageHandler = connection.listeners('message')[0] as any;
        await messageHandler({ type: 'utf8', utf8Data: JSON.stringify(message) });
    };

    it('accepts the Heimdall WebSocket protocol', () => {
        expect(resolveAcceptedWebSocketProtocol([HEIMDALL_WEBSOCKET_PROTOCOL])).toBe(HEIMDALL_WEBSOCKET_PROTOCOL);
    });

    it('accepts the legacy WebSocket protocol', () => {
        expect(resolveAcceptedWebSocketProtocol([LEGACY_WEBSOCKET_PROTOCOL])).toBe(LEGACY_WEBSOCKET_PROTOCOL);
    });

    it('rejects unsupported WebSocket protocols', () => {
        expect(resolveAcceptedWebSocketProtocol(['unsupported-protocol'])).toBeNull();
    });

    it('keeps legacy aggregation publishing explicit while recording outbound result dispatches', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-dispatch-'));
        const events = new EventEmitter();
        const websocketServer = new EventEmitter() as any;
        const publisher = { publish: jest.fn(), update_latest_inbox: jest.fn(), lilURL: 'http://example.test/' } as any;
        const handler = new WebSocketHandler(websocketServer, events, publisher, { info: jest.fn(), debug: jest.fn() }, new MetricWriter(directory));
        handler.aggregation_event_publisher();
        handler.aggregation_event_publisher();
        expect(events.listenerCount('aggregation_event')).toBe(1);

        const connection = { send: jest.fn() };
        (handler as any).connections.set('query-a', [connection]);
        handler.send_result_to_client('query-a', { aggregation_event: '<http://result> <http://p> <http://o> .' });
        expect(connection.send).toHaveBeenCalledTimes(1);
        const metrics = fs.readFileSync(path.join(directory, 'result-dispatch.csv'), 'utf8');
        expect(metrics).toContain('result_delivery_send');
        expect(metrics).toMatch(/[a-f0-9]{64}/);
    });

    it('does not invoke legacy authentication or authorization for an evaluation query', async () => {
        const { handler, websocketServer } = createEvaluationHandler();
        jest.spyOn(handler, 'preprocess_query').mockResolvedValue({
            ldes_query: 'SELECT * WHERE { ?s ?p ?o }',
            query_hashed: 'query-hash',
            width: 1000,
        });
        const processQuery = jest.spyOn(handler, 'process_query').mockImplementation(() => undefined);
        const legacyAuthentication = jest.spyOn(handler, 'if_authenticated').mockResolvedValue(false);
        const legacyAuthorization = jest.spyOn(handler, 'if_authorized').mockResolvedValue(true);

        await sendEvaluationQuery(handler, websocketServer, {
            query: 'SELECT * WHERE { ?s ?p ?o }',
            type: 'live',
            client_id: 'client-a',
        });

        expect(processQuery).toHaveBeenCalled();
        expect(legacyAuthentication).not.toHaveBeenCalled();
        expect(legacyAuthorization).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('delivers evaluation results over WebSocket without persistence or authentication metrics', async () => {
        const { handler, websocketServer } = createEvaluationHandler();
        jest.spyOn(handler, 'preprocess_query').mockResolvedValue({
            ldes_query: 'SELECT * WHERE { ?s ?p ?o }',
            query_hashed: 'query-hash',
            width: 1000,
        });
        const processQuery = jest.spyOn(handler, 'process_query').mockImplementation(() => undefined);
        const legacyAuthentication = jest.spyOn(handler, 'if_authenticated').mockResolvedValue(true);
        const legacyAuthorization = jest.spyOn(handler, 'if_authorized').mockResolvedValue(false);

        await sendEvaluationQuery(handler, websocketServer, {
            query: 'SELECT * WHERE { ?s ?p ?o }',
            type: 'live',
            client_id: 'client-a',
        });

        expect(processQuery).toHaveBeenCalledWith(
            'SELECT * WHERE { ?s ?p ?o }',
            1000,
            'live',
            handler.event_emitter,
            'client-a',
        );
        expect(legacyAuthentication).not.toHaveBeenCalled();
        expect(legacyAuthorization).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();

        const connection = (handler as any).connections.get('query-hash')[0];
        const event = JSON.stringify({ query_hash: 'query-hash', aggregation_event: '<http://result> <http://p> <http://o> .' });
        handler.event_emitter.emit('aggregation_event', event);
        expect(connection.send).toHaveBeenCalledWith('<http://result> <http://p> <http://o> .');
        expect((handler as any).aggregation_publisher).toBeUndefined();
        const metrics = fs.readFileSync(path.join((handler as any).metric_writer.resultsDir, 'initialization.csv'), 'utf8');
        expect(metrics).not.toContain('service_authentication');
    });

    it('does not register the legacy aggregation publisher', () => {
        const { handler, websocketServer } = createEvaluationHandler();
        expect(handler.aggregation_publisher).toBeUndefined();
        expect(handler.event_emitter.listenerCount('aggregation_event')).toBe(1);
        expect(websocketServer.listenerCount('request')).toBe(1);
    });
});
