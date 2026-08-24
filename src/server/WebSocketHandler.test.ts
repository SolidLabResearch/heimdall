import { HEIMDALL_WEBSOCKET_PROTOCOL, LEGACY_WEBSOCKET_PROTOCOL, resolveAcceptedWebSocketProtocol } from './websocketProtocols';
import { EventEmitter } from 'events';
import { WebSocketHandler } from './WebSocketHandler';
import { MetricWriter } from '../evaluation/MetricWriter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('WebSocketHandler compatibility', () => {
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
});
