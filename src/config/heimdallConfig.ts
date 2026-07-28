export const DEFAULT_HEIMDALL_HTTP_SERVER_URL = 'http://n078-22.wall1.ilabt.imec.be:8080/';
export const DEFAULT_HEIMDALL_WS_SERVER_URL = 'ws://n078-22.wall1.ilabt.imec.be:8080/';
export const DEFAULT_HEIMDALL_RATE_LIMIT = 30;

export type HeimdallSetupConfig = {
    heimdall_http_server_url?: string;
    aggregator_http_server_url?: string;
    heimdall_ws_server_url?: string;
    aggregator_ws_server_url?: string;
};

export type HeimdallRuntimeConfig = {
    aggregation_pod_ldes_location: string;
    heimdall_rate_limit?: number;
    aggregator_rate_limit?: number;
};

export type ResolvedHeimdallSetupConfig = {
    heimdallHttpServerUrl: string;
    heimdallWsServerUrl: string;
};

export type ResolvedHeimdallRuntimeConfig = {
    aggregationPodLdesLocation: string;
    heimdallRateLimit: number;
};

/**
 * Resolve Heimdall setup URLs from new or legacy configuration keys.
 * @param {HeimdallSetupConfig} config - The raw setup configuration object.
 * @returns {ResolvedHeimdallSetupConfig} The normalized setup configuration.
 */
export function resolveHeimdallSetupConfig(config: HeimdallSetupConfig): ResolvedHeimdallSetupConfig {
    return {
        heimdallHttpServerUrl:
            config.heimdall_http_server_url ??
            config.aggregator_http_server_url ??
            DEFAULT_HEIMDALL_HTTP_SERVER_URL,
        heimdallWsServerUrl:
            config.heimdall_ws_server_url ??
            config.aggregator_ws_server_url ??
            DEFAULT_HEIMDALL_WS_SERVER_URL,
    };
}

/**
 * Resolve Heimdall runtime settings from new or legacy configuration keys.
 * @param {HeimdallRuntimeConfig} config - The raw runtime configuration object.
 * @returns {ResolvedHeimdallRuntimeConfig} The normalized runtime configuration.
 */
export function resolveHeimdallRuntimeConfig(config: HeimdallRuntimeConfig): ResolvedHeimdallRuntimeConfig {
    return {
        aggregationPodLdesLocation: config.aggregation_pod_ldes_location,
        heimdallRateLimit:
            config.heimdall_rate_limit ??
            config.aggregator_rate_limit ??
            DEFAULT_HEIMDALL_RATE_LIMIT,
    };
}
