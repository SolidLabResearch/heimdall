import { HEIMDALL_WEBSOCKET_PROTOCOL, LEGACY_WEBSOCKET_PROTOCOL, resolveAcceptedWebSocketProtocol } from './websocketProtocols';
import { EventEmitter } from 'events';
import { WebSocketHandler } from './WebSocketHandler';
import { MetricWriter } from '../evaluation/MetricWriter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('WebSocketHandler compatibility', () => {
    const createEvaluationHandler = () => {
        const events = new EventEmitter();
        const websocketServer = new EventEmitter() as any;
        const publisher = { publish: jest.fn(), update_latest_inbox: jest.fn(), lilURL: 'http://example.test/' } as any;
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-evaluation-'));
        const handler = new WebSocketHandler(
            websocketServer,
            events,
            publisher,
            { info: jest.fn(), debug: jest.fn() },
            new MetricWriter(directory),
        );
        handler.handle_wss();

        return { handler, websocketServer };
    };

    const sendEvaluationQuery = async (handler: WebSocketHandler, websocketServer: EventEmitter, message: object) => {
        const connection = new EventEmitter() as any;
        const request = {
            requestedProtocols: [HEIMDALL_WEBSOCKET_PROTOCOL],
            origin: 'http://example.test',
            accept: jest.fn(() => connection),
        };
        const requestHandler = websocketServer.listeners('request')[0] as (request: any) => Promise<void>;
        await requestHandler(request);
        const messageHandler = connection.listeners('message')[0] as (message: any) => Promise<void>;
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

    it('registers one aggregation publisher and records outbound result dispatches', () => {
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

    it('does not process an evaluation query when authentication fails', async () => {
        const { handler, websocketServer } = createEvaluationHandler();
        jest.spyOn(handler, 'preprocess_query').mockResolvedValue({
            ldes_query: 'SELECT * WHERE { ?s ?p ?o }',
            query_hashed: 'query-hash',
            width: 1000,
        });
        jest.spyOn(handler, 'if_authenticated').mockResolvedValue(false);
        const processQuery = jest.spyOn(handler, 'process_query').mockImplementation(() => undefined);
        const legacyAuthorization = jest.spyOn(handler, 'if_authorized').mockResolvedValue(true);

        await sendEvaluationQuery(handler, websocketServer, {
            query: 'SELECT * WHERE { ?s ?p ?o }',
            type: 'live',
            client_id: 'client-a',
        });

        expect(processQuery).not.toHaveBeenCalled();
        expect(legacyAuthorization).not.toHaveBeenCalled();
    });

    it('processes an evaluation query after authentication without invoking legacy authorization', async () => {
        const { handler, websocketServer } = createEvaluationHandler();
        jest.spyOn(handler, 'preprocess_query').mockResolvedValue({
            ldes_query: 'SELECT * WHERE { ?s ?p ?o }',
            query_hashed: 'query-hash',
            width: 1000,
        });
        jest.spyOn(handler, 'if_authenticated').mockResolvedValue(true);
        const processQuery = jest.spyOn(handler, 'process_query').mockImplementation(() => undefined);
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
        expect(legacyAuthorization).not.toHaveBeenCalled();
    });
});
