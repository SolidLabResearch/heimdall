# Heimdall

Heimdall is a Solid stream-analytics service for RSP-QL queries over LDES-in-LDP streams. A client registers a query over WebSocket; Heimdall either uses the explicit stream URLs in that query or discovers relevant streams through a Solid Type Index, then processes live or historical-plus-live data and delivers results over WebSocket.

Equivalent registered queries reuse one query execution. Independently, `SharedStreamRegistry` owns physical Solid notification subscriptions: executions using the same canonical stream each receive events in their own RSP-JS stream, while the Solid stream is fetched, parsed, and subscribed to only once.

## Install and run

```bash
npm install
npm run build
npm run start-aggregation
```

The RSP-JS dependency is pinned to public revision `56e773d8416f978d82a8288802532cabdf8ffef6`; `npm run build` builds it before compiling Heimdall. No sibling `../RSP-JS` checkout is required. Heimdall listens on port 8080; `GET /health` reports readiness.

The legacy aggregation-pod workflow can be started locally when needed:

```bash
npm run start-solid-server
```

## Configuration

`src/config/heimdall_setup.json` provides localhost development defaults. Configure a deployment with environment variables rather than editing code:

```bash
HEIMDALL_HTTP_SERVER_URL=https://heimdall.example/ \
HEIMDALL_WS_SERVER_URL=wss://heimdall.example/ \
npm run start-aggregation
```

`HEIMDALL_HTTP_SERVER_URL` and `HEIMDALL_WS_SERVER_URL` override the JSON setup values. Existing `heimdall_*` JSON keys remain supported, as do legacy `aggregator_*` JSON keys and `AGGREGATOR_HTTP_SERVER_URL` / `AGGREGATOR_WS_SERVER_URL` environment variables. Normal defaults never target an imec experiment host.

For Pod-based discovery, the requested Solid Pod must publish relevant LDES streams through its [Type Index](https://solid.github.io/type-indexes/). Queries that already name concrete `STREAM` URLs preserve those URLs and do not perform Type Index discovery.

## Register a query

Connect to Heimdall's WebSocket endpoint with the `heimdall-protocol` subprotocol and send a JSON message such as:

```json
{
  "query": "REGISTER RSTREAM <urn:result> AS SELECT * FROM STREAM <https://pod.example/stream/> [RANGE PT10S STEP PT10S] WHERE { ?s ?p ?o }",
  "type": "live",
  "client_id": "client-1"
}
```

`type` is `live` or `historical+live`. Once query setup, including live-stream attachment, completes, Heimdall sends `{ "type": "query_ready", ... }`. Results are subsequently delivered through the same service WebSocket path.

## Tests and checks

```bash
npm run build
npx tsc --noEmit
npm test
npm run lint:ts
```

## Sensors 2026 reproducibility

The untouched Sensors 2026 evaluation snapshot is the annotated tag `sensors-2026-evaluation` at `c663e6b3a2be39688dae7682576de32fb50a8d8c`. It intentionally retains the experiment's testbed-specific configuration and local RSP-JS dependency. The modern runtime keeps the evaluation tooling separate: see [EVALUATION-METRICS.md](./EVALUATION-METRICS.md) and [EVALUATION-DEPLOYMENT-AUDIT.md](./EVALUATION-DEPLOYMENT-AUDIT.md). To reproduce that experiment, check out the tag and follow its historical evaluation setup; the imec n079 host is not required for normal Heimdall use.

## License

This code is copyrighted by [Ghent University - imec](https://www.ugent.be/ea/idlab/en) and released under the [MIT Licence](./LICENCE) 

## Contact

For any questions, please contact [Kush](mailto:kushagrasingh.bisen@ugent.be) or create an issue in the repository [here](https://github.com/SolidLabResearch/solid-stream-aggregator/issues) .
