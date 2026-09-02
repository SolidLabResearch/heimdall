import {
    DEFAULT_HEIMDALL_HTTP_SERVER_URL,
    DEFAULT_HEIMDALL_RATE_LIMIT,
    DEFAULT_HEIMDALL_WS_SERVER_URL,
    resolveHeimdallRuntimeConfig,
    resolveHeimdallSetupConfig,
} from './heimdallConfig';

describe('heimdall configuration compatibility', () => {
    it('uses local development defaults without directing users to an experiment testbed', () => {
        expect(DEFAULT_HEIMDALL_HTTP_SERVER_URL).toBe('http://localhost:8080/');
        expect(DEFAULT_HEIMDALL_WS_SERVER_URL).toBe('ws://localhost:8080/');
        expect(resolveHeimdallSetupConfig({})).toEqual({
            heimdallHttpServerUrl: 'http://localhost:8080/',
            heimdallWsServerUrl: 'ws://localhost:8080/',
        });
    });

    it('prefers Heimdall environment variables, with legacy aggregator variables as fallback', () => {
        expect(resolveHeimdallSetupConfig({
            heimdall_http_server_url: 'http://config.example/http',
            heimdall_ws_server_url: 'ws://config.example/ws',
        }, {
            HEIMDALL_HTTP_SERVER_URL: 'http://environment.example/http',
            HEIMDALL_WS_SERVER_URL: 'ws://environment.example/ws',
        })).toEqual({
            heimdallHttpServerUrl: 'http://environment.example/http',
            heimdallWsServerUrl: 'ws://environment.example/ws',
        });
        expect(resolveHeimdallSetupConfig({}, {
            AGGREGATOR_HTTP_SERVER_URL: 'http://legacy-environment.example/http',
            AGGREGATOR_WS_SERVER_URL: 'ws://legacy-environment.example/ws',
        })).toEqual({
            heimdallHttpServerUrl: 'http://legacy-environment.example/http',
            heimdallWsServerUrl: 'ws://legacy-environment.example/ws',
        });
    });

    it('prefers new setup keys when present', () => {
        expect(resolveHeimdallSetupConfig({
            heimdall_http_server_url: 'http://heimdall.example/http',
            heimdall_ws_server_url: 'ws://heimdall.example/ws',
        })).toEqual({
            heimdallHttpServerUrl: 'http://heimdall.example/http',
            heimdallWsServerUrl: 'ws://heimdall.example/ws',
        });
    });

    it('falls back to legacy setup keys when the new keys are absent', () => {
        expect(resolveHeimdallSetupConfig({
            aggregator_http_server_url: 'http://legacy.example/http',
            aggregator_ws_server_url: 'ws://legacy.example/ws',
        })).toEqual({
            heimdallHttpServerUrl: 'http://legacy.example/http',
            heimdallWsServerUrl: 'ws://legacy.example/ws',
        });
    });

    it('prefers new setup keys over legacy setup keys when both are present', () => {
        expect(resolveHeimdallSetupConfig({
            heimdall_http_server_url: 'http://heimdall.example/http',
            aggregator_http_server_url: 'http://legacy.example/http',
            heimdall_ws_server_url: 'ws://heimdall.example/ws',
            aggregator_ws_server_url: 'ws://legacy.example/ws',
        })).toEqual({
            heimdallHttpServerUrl: 'http://heimdall.example/http',
            heimdallWsServerUrl: 'ws://heimdall.example/ws',
        });
    });

    it('preserves the current defaults when neither setup key exists', () => {
        expect(resolveHeimdallSetupConfig({})).toEqual({
            heimdallHttpServerUrl: DEFAULT_HEIMDALL_HTTP_SERVER_URL,
            heimdallWsServerUrl: DEFAULT_HEIMDALL_WS_SERVER_URL,
        });
    });

    it('prefers the new runtime key when present', () => {
        expect(resolveHeimdallRuntimeConfig({
            aggregation_pod_ldes_location: 'http://localhost:3000/aggregation_pod/',
            heimdall_rate_limit: 15,
        })).toEqual({
            aggregationPodLdesLocation: 'http://localhost:3000/aggregation_pod/',
            heimdallRateLimit: 15,
        });
    });

    it('falls back to the legacy runtime key when the new key is absent', () => {
        expect(resolveHeimdallRuntimeConfig({
            aggregation_pod_ldes_location: 'http://localhost:3000/aggregation_pod/',
            aggregator_rate_limit: 20,
        })).toEqual({
            aggregationPodLdesLocation: 'http://localhost:3000/aggregation_pod/',
            heimdallRateLimit: 20,
        });
    });

    it('prefers the new runtime key over the legacy runtime key when both are present', () => {
        expect(resolveHeimdallRuntimeConfig({
            aggregation_pod_ldes_location: 'http://localhost:3000/aggregation_pod/',
            heimdall_rate_limit: 10,
            aggregator_rate_limit: 25,
        })).toEqual({
            aggregationPodLdesLocation: 'http://localhost:3000/aggregation_pod/',
            heimdallRateLimit: 10,
        });
    });

    it('preserves the current runtime default when neither rate-limit key exists', () => {
        expect(resolveHeimdallRuntimeConfig({
            aggregation_pod_ldes_location: 'http://localhost:3000/aggregation_pod/',
        })).toEqual({
            aggregationPodLdesLocation: 'http://localhost:3000/aggregation_pod/',
            heimdallRateLimit: DEFAULT_HEIMDALL_RATE_LIMIT,
        });
    });
});
