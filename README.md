# Heimdall

Heimdall is a service for continuous semantic stream processing over RDF streams stored in decentralized Solid environments. Clients register RSP-QL continuous queries through WebSocket. Heimdall resolves the relevant Solid streams, processes their updates, and delivers query results to subscribed clients over WebSocket.

Heimdall has two distinct reuse mechanisms:

- Equivalent-query execution reuse: an equivalent registered query can reuse an existing query execution and its result stream.
- Shared physical stream acquisition: independent query executions reading the same LDES stream can reuse its Solid notification subscription and upstream event acquisition.

These mechanisms are independent: sharing a physical stream does not make different queries share RSP-JS query execution or results.

## Architecture

The live query path is:

```text
Client
  -> WebSocketHandler
  -> query preprocessing / stream discovery
  -> QueryRegistry
  -> HeimdallInstantiator
  -> SharedStreamRegistry
  -> Solid Notifications
  -> event retrieval and parsing
  -> RSP-JS
  -> WebSocket result delivery
```

- `WebSocketHandler` accepts query registrations, preprocesses stream references, associates clients with executions, and sends readiness acknowledgements and results.
- `QueryRegistry` identifies equivalent registered queries and coordinates reuse of an existing execution.
- `HeimdallInstantiator` constructs an RSP-JS engine for a query, installs output routing, and initializes live or historical-plus-live processing.
- `SharedStreamRegistry` is service-owned live-stream acquisition. It owns Solid notification subscriptions and distributes each retrieved, parsed event to the RSP-JS input stream of every execution attached to that physical LDES stream.
- [RSP-JS](https://github.com/argahsuknesib/RSP-JS) evaluates RSP-QL windows and emits continuous query results.

## Reuse model

### Equivalent-query reuse

`QueryRegistry` uses the repository's query-equivalence check to detect equivalent registered queries. An equivalent query reuses the canonical query execution and its result stream; its client is associated with that execution. Heimdall does not claim general query containment, semantic subsumption, or reuse for arbitrary similar queries.

### Shared physical stream acquisition

Different query executions can read the same canonical LDES stream while remaining separate RSP-JS executions. `SharedStreamRegistry` creates one Solid notification subscription for that stream, retrieves each notified event once, and parses it once. It then inserts the event into each attached execution's own RSP-JS stream. This is separate from equivalent-query reuse and does not share results across non-equivalent queries.

## Features

- RSP-QL continuous processing through RSP-JS
- `live` and `historical+live` query modes
- Explicit `STREAM` URLs in RSP-QL queries, including preserved multi-stream queries
- Solid Type Index-based stream discovery for the supported single-source form
- Equivalent-query execution reuse
- SharedStreamRegistry physical subscription, retrieval, and parsing reuse
- Solid Notifications for live stream updates
- WebSocket result delivery and `query_ready` acknowledgement
- Structured evaluation and runtime instrumentation

## Requirements

- Node.js and npm. `package.json` does not currently declare an `engines` version range.
- A Solid / LDES-in-LDP deployment for the streams being queried. For discovery, the Pod must expose appropriate LDES metadata through its Type Index. Live acquisition also expects the Solid notification and LDP metadata endpoints used by the stream.
- RSP-JS, installed as the exact public Git revision `db30dea9c2e9182379d920423c230566512f629c` by npm.

## Installation

```bash
git clone https://github.com/SolidLabResearch/heimdall.git
cd heimdall
npm install
npm run build
```

Current maintained code pins RSP-JS to `db30dea9c2e9182379d920423c230566512f629c`. A manually prepared sibling `../RSP-JS` checkout is not required. This is different from the frozen Sensors snapshot, which retains its historical dependency arrangement.

## Running Heimdall

The aggregation service command is:

```bash
npm run start-aggregation
```

The command starts the HTTP/WebSocket service on port 8080 by default. When the service is running, `GET /health` returns `{ "status": "ok" }`.

## Configuration

`src/config/heimdall_setup.json` supplies JSON configuration. The resolved service URLs use this precedence, from highest to lowest:

1. `HEIMDALL_HTTP_SERVER_URL` / `HEIMDALL_WS_SERVER_URL`
2. Legacy `AGGREGATOR_HTTP_SERVER_URL` / `AGGREGATOR_WS_SERVER_URL`
3. `heimdall_http_server_url` / `heimdall_ws_server_url` in JSON
4. Legacy `aggregator_http_server_url` / `aggregator_ws_server_url` in JSON
5. Localhost defaults: `http://localhost:8080/` and `ws://localhost:8080/`

For example:

```bash
HEIMDALL_HTTP_SERVER_URL=https://heimdall.example/ \
HEIMDALL_WS_SERVER_URL=wss://heimdall.example/ \
npm run start-aggregation
```

The legacy names remain for compatibility. Normal defaults and examples do not point to an experiment testbed.

## Stream resolution

Heimdall supports two stream-reference paths:

1. **Explicit `STREAM` URLs.** RSP-QL queries name their sources with `STREAM` URLs. Queries with multiple stream references preserve every supplied URL without discovery or mutation.
2. **Type Index discovery.** For the current single-source form, Heimdall treats the `STREAM` source as a Solid Pod, extracts the query's aggregation focus, resolves a relevant LDES stream through the Pod's Type Index, and substitutes that stream in the query. If no relevant stream is found, registration fails rather than selecting an arbitrary stream. The current implementation therefore does not provide a separate single-stream bypass for Type Index discovery.

## Register a query

Connect to Heimdall's WebSocket endpoint using the `heimdall-protocol` subprotocol. The server also accepts the legacy `solid-stream-aggregator-protocol` subprotocol for compatibility, but new clients should use `heimdall-protocol`.

Send a JSON message containing a query, a processing type, and a client identifier:

```json
{
  "query": "REGISTER RSTREAM <urn:result> AS SELECT * FROM STREAM <https://pod.example/stream/> [RANGE PT10S STEP PT10S] WHERE { ?s ?p ?o }",
  "type": "live",
  "client_id": "client-1"
}
```

`type` must be `live` or `historical+live`. After query registration, output routing, and the required live-stream attachment or reuse have completed, Heimdall sends:

```json
{
  "type": "query_ready",
  "query_id": "<SHA-256 of the preprocessed query>",
  "client_id": "client-1"
}
```

`query_ready` is not sent merely because the request was received: the registration path awaits the execution readiness promise, including RSP-JS construction, result routing, and the relevant shared-stream initialization or reuse. Query results are then sent through the same service WebSocket path.

## Credentials

### Normal live operation

Normal `live` operation, including the Sensors-style live evaluation path, does not load source-Pod client credentials.

### historical+live

`historical+live` requires a client-credential entry for each source stream. Copy [source-pod-credentials.example.json](./config/source-pod-credentials.example.json) to `config/source-pod-credentials.local.json`, fill it locally, and keep it untracked. Alternatively, set `HEIMDALL_SOURCE_POD_CREDENTIALS_FILE` to a local credential-file path.

### Legacy aggregation-Pod functionality

The retained aggregation-Pod authentication and publishing features are separate from normal live processing. Configure them with `config/aggregation-pod-credentials.local.json`, based on [aggregation-pod-credentials.example.json](./config/aggregation-pod-credentials.example.json), or set `HEIMDALL_AGGREGATION_POD_CREDENTIALS_FILE`.

The old local aggregation-Pod seeding helper additionally uses `src/server/aggregator-pod/account.local.json`, based on `src/server/aggregator-pod/account.example.json`, or `HEIMDALL_AGGREGATION_POD_ACCOUNT_FILE`.

These local credential files are Git-ignored. Never commit real credentials. Credentials previously present in historical commits or the Sensors tag must be treated as exposed and must never be retrieved or reused.

## Testing

Run the available checks with:

```bash
npm run build
npx tsc --noEmit
npm test -- --runInBand
npm run lint:ts
```

On PR #51, the build and TypeScript check pass, and 104 tests pass. TypeScript linting still has substantial legacy and research-lineage debt; it is not treated as a clean baseline for unrelated documentation work.

## Sensors 2026 reproducibility

The maintained implementation is `master`. The exact Heimdall source snapshot used for the Sensors 2026 evaluation is the annotated `sensors-2026-evaluation` tag, which dereferences to `c663e6b3a2be39688dae7682576de32fb50a8d8c`.

The tag preserves Heimdall's historical source state, not a complete standalone experiment. Full reproduction also requires the corresponding RSP-JS setup, Solid deployment, workload and data, experimental configuration, and infrastructure. Consult [EVALUATION-METRICS.md](./EVALUATION-METRICS.md) for the metric contract and [EVALUATION-DEPLOYMENT-AUDIT.md](./EVALUATION-DEPLOYMENT-AUDIT.md) for deployment-path distinctions.

`master` uses the corrected RSP-JS runtime dependency above. The Sensors tag remains the exact historical software snapshot and retains its historical dependency setup.

Do not use historical commits or the Sensors tag as a credential source.

## Repository structure

- `src/server/` — HTTP, WebSocket, and query-registration handling
- `src/service/heimdall/` — query instantiation, live stream processing, and `SharedStreamRegistry`
- `src/service/query-registry/` — equivalent-query registration and readiness tracking
- `src/config/` — runtime configuration; `config/` contains safe credential templates
- `src/benchmark/` — initialization-latency benchmark code
- `src/evaluation/` — metric writing and runtime instrumentation
- `src/test/` and colocated `*.test.ts` files — test support and tests
- `scripts/` — local Solid server and UMA-related utility scripts

## Citation

No `CITATION.cff` or final publication metadata is currently included. If you use Heimdall in academic work, please cite the corresponding Heimdall publication. Citation details will be updated after publication.

## License

Heimdall is released under the [MIT License](./LICENCE.md), copyright Ghent University - imec.

## Contact

For questions, contact [Kush](mailto:kushagrasingh.bisen@ugent.be) or open an issue at [SolidLabResearch/heimdall](https://github.com/SolidLabResearch/heimdall/issues).
