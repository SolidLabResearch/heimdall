# Evaluation deployment audit

Heimdall currently requires its own aggregation Solid Pod on `localhost:3000`. This is distinct from the source Solid Pods. Start in this order: (1) the Heimdall aggregation Pod, (2) Heimdall service, (3) evaluation client, (4) replayer.

| Location | Classification | Four-machine implication |
| --- | --- | --- |
| `src/config/heimdall_config.json`, `src/config/ldes_properties.json`, `src/service/publishing-stream-to-pod/LDESPublisher.ts` | intentionally Heimdall-local aggregation Pod | aggregation Pod must remain local to Heimdall on port 3000 |
| `src/server/WebSocketHandler.ts`, `src/service/authorization/AccessResource.ts` | authorization implementation dependency | static WebIDs, targets, and policy-container URLs prevent a generic multi-machine deployment until configured; this branch deliberately does not refactor authorization |
| `src/config/PodToken.json` | source Solid Pod reference | hard-coded source stream URLs and credentials must be replaced with testbed configuration for remote source Pods |
| `src/server/EndpointQueries.ts`, tests, `scripts/uma/*`, examples | demo/test-only code | not part of the live evaluation path, but unsuitable as four-machine configuration |
| `src/service/heimdall/HeimdallInstantiator.ts` and `src/service/query-registry/QueryRegistry.ts` | service-local WebSocket implementation dependency | loopback port 8080 assumes the service's internal result connection is local; keep it on the Heimdall machine |

No service-discovery operation exists in Heimdall. The client supplies the Heimdall WebSocket address directly.
