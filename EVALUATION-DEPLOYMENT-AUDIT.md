# Evaluation deployment audit

For the 4 Hz evaluation, Heimdall starts directly on port 8080. Results are delivered to subscribed clients over WebSocket; Heimdall-local result persistence is not part of the evaluation, so no local `aggregation_pod` or Community Solid Server is required on the Heimdall host.

| Location | Classification | Four-machine implication |
| --- | --- | --- |
| `src/config/heimdall_config.json`, `src/config/ldes_properties.json`, `src/service/publishing-stream-to-pod/LDESPublisher.ts` | legacy Heimdall-local aggregation-pod publishing | retained for compatibility, but not constructed or registered by the 4 Hz evaluation path |
| `src/server/WebSocketHandler.ts`, `src/service/authorization/AccessResource.ts` | legacy authorization implementation | retained for compatibility; the 4 Hz evaluation does not invoke local aggregation-pod authentication or authorization |
| `src/config/PodToken.json` | source Solid Pod reference | hard-coded source stream URLs and credentials must be replaced with testbed configuration for remote source Pods |
| `src/server/EndpointQueries.ts`, tests, `scripts/uma/*`, examples | demo/test-only code | not part of the live evaluation path, but unsuitable as four-machine configuration |
| `src/service/heimdall/HeimdallInstantiator.ts` and `src/service/query-registry/QueryRegistry.ts` | service-local WebSocket implementation dependency | loopback port 8080 assumes the service's internal result connection is local; keep it on the Heimdall machine |

No service-discovery operation exists in Heimdall. The client supplies the Heimdall WebSocket address directly.

The deployed source streams use the allow-all configuration and the live evaluation path accesses them through ordinary LDP/HTTP operations. No source-Pod authentication operation is executed, so `service_authentication` is intentionally unperformed and downstream metrics should render it as `--`. Authentication is measured only when a real source-Pod authentication operation is actually executed.
