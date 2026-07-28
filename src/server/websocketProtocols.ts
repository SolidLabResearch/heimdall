export const HEIMDALL_WEBSOCKET_PROTOCOL = 'heimdall-protocol';
export const LEGACY_WEBSOCKET_PROTOCOL = 'solid-stream-aggregator-protocol';

/**
 * Resolve the first supported WebSocket subprotocol from the requested list.
 * @param {string[]} requestedProtocols - The subprotocols requested by the client.
 * @returns {string | null} The accepted protocol, or null when none is supported.
 */
export function resolveAcceptedWebSocketProtocol(requestedProtocols: string[] = []): string | null {
    if (requestedProtocols.includes(HEIMDALL_WEBSOCKET_PROTOCOL)) {
        return HEIMDALL_WEBSOCKET_PROTOCOL;
    }

    if (requestedProtocols.includes(LEGACY_WEBSOCKET_PROTOCOL)) {
        return LEGACY_WEBSOCKET_PROTOCOL;
    }

    return null;
}
