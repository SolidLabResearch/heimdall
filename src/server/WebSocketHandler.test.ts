import { HEIMDALL_WEBSOCKET_PROTOCOL, LEGACY_WEBSOCKET_PROTOCOL, resolveAcceptedWebSocketProtocol } from './websocketProtocols';

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
});
