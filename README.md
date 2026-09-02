# Heimdall

Heimdall is a service for continuous semantic processing of RDF streams stored in decentralized Solid environments. Clients register RSP-QL continuous queries over WebSocket; Heimdall discovers or resolves the relevant streams, processes updates using RSP-JS, and pushes query results back to subscribed clients.

## Architecture

```text
Client
  -> WebSocketHandler
  -> stream discovery / query preprocessing
  -> QueryRegistry
  -> HeimdallInstantiator
  -> SharedStreamRegistry
  -> Solid Notifications
  -> event retrieval and parsing
  -> RSP-JS
  -> WebSocket results
```

Main components:

- `WebSocketHandler` — query registration, preprocessing, client association, readiness acknowledgements, and result delivery.
- `QueryRegistry` — detects equivalent queries and reuses existing executions.
- `HeimdallInstantiator` — creates and configures RSP-JS query executions.
- `SharedStreamRegistry` — shares Solid notification subscriptions, event retrieval, and parsing between executions reading the same physical stream.
- [RSP-JS](https://github.com/argahsuknesib/RSP-JS) — evaluates RSP-QL queries and windows.

## Reuse

Heimdall provides two independent reuse mechanisms:

1. **Equivalent-query reuse** — equivalent queries share the same RSP-JS execution and result stream.
2. **Physical stream reuse** — different query executions reading the same LDES stream share its Solid notification subscription, retrieval, and parsing.

Physical stream reuse does **not** imply shared query execution or results.

## Features

- RSP-QL continuous processing with RSP-JS
- `live` and `historical+live` processing
- Explicit single- and multi-stream `STREAM` URLs
- Solid Type Index stream discovery
- Equivalent-query execution reuse
- Shared physical stream acquisition
- Solid Notifications
- WebSocket query registration and result delivery
- Runtime and evaluation instrumentation

## Requirements

- Node.js and npm
- A Solid / LDES-in-LDP deployment
- RSP-JS, pinned to Git revision:
  `db30dea9c2e9182379d920423c230566512f629c`

## Installation

```bash
git clone https://github.com/SolidLabResearch/heimdall.git
cd heimdall
npm install
npm run build
```

RSP-JS is installed automatically through npm; a separate `../RSP-JS` checkout is not required.

## Running

```bash
npm run start-aggregation
```

The service runs on port `8080` by default.

Health check:

```text
GET /health
```

returns:

```json
{ "status": "ok" }
```

## Configuration

Configuration is read from:

```text
src/config/heimdall_setup.json
```

Service URLs use the following precedence:

1. `HEIMDALL_HTTP_SERVER_URL` / `HEIMDALL_WS_SERVER_URL`
2. Legacy `AGGREGATOR_HTTP_SERVER_URL` / `AGGREGATOR_WS_SERVER_URL`
3. `heimdall_http_server_url` / `heimdall_ws_server_url`
4. Legacy JSON aggregator values
5. `http://localhost:8080/` / `ws://localhost:8080/`

Example:

```bash
HEIMDALL_HTTP_SERVER_URL=https://heimdall.example/ \
HEIMDALL_WS_SERVER_URL=wss://heimdall.example/ \
npm run start-aggregation
```

## Stream Resolution

Heimdall supports:

### Explicit Stream URLs

Queries can directly identify streams through `STREAM` URLs. Multi-stream queries preserve all supplied URLs.

### Type Index Discovery

For the supported single-source form, the `STREAM` source can identify a Solid Pod. Heimdall uses the query's aggregation focus and the Pod's Type Index to resolve the relevant LDES stream.

Registration fails if no matching stream can be found.

## Registering a Query

Connect using the WebSocket subprotocol:

```text
heimdall-protocol
```

The legacy `solid-stream-aggregator-protocol` remains supported.

Example registration:

```json
{
  "query": "REGISTER RSTREAM <urn:result> AS SELECT * FROM STREAM <https://pod.example/stream/> [RANGE X STEP Y] WHERE { ?s ?p ?o }",
  "type": "live",
  "client_id": "client-1"
}
```

`type` must be either:

- `live`
- `historical+live`

Once query execution and stream attachment are ready, Heimdall sends:

```json
{
  "type": "query_ready",
  "query_id": "<SHA-256 of the preprocessed query>",
  "client_id": "client-1"
}
```

Query results are subsequently delivered over the same WebSocket connection.

## Protected Solid Sources

Heimdall supports public and authenticated Solid sources.

Copy:

```text
config/source-pod-credentials.example.json
```

to:

```text
config/source-pod-credentials.local.json
```

or specify a credentials file with:

```bash
HEIMDALL_SOURCE_POD_CREDENTIALS_FILE=/path/to/credentials.json
```

Credential entries contain CSS client credentials:

```json
{
  "id": "...",
  "secret": "...",
  "idp": "..."
}
```

Entries can match stream URLs or Pod URL prefixes. Heimdall selects the most-specific valid match and reuses authenticated sessions for discovery, historical retrieval, notification setup, subscriptions, and event retrieval.

Without matching credentials, Heimdall uses unauthenticated HTTP.

## Testing

```bash
npm run build
npx tsc --noEmit
npm test -- --runInBand
npm run lint:ts
```

Build, TypeScript checking, and tests are the primary validation path. The TypeScript lint baseline still contains legacy issues.

## Repository Structure

```text
src/server/                  HTTP and WebSocket handling
src/service/heimdall/        Query execution and SharedStreamRegistry
src/service/query-registry/  Query reuse and readiness tracking
src/config/                  Runtime configuration
config/                      Credential templates
src/benchmark/               Benchmark code
src/evaluation/              Runtime instrumentation
src/test/                    Tests and test utilities
scripts/                     Solid/UMA utility scripts
```

## Citation

No `CITATION.cff` is currently provided. For academic use, cite the repository together with the corresponding version or commit.

## License

[MIT License](./LICENCE.md) — Ghent University - imec.

## Contact

[Kush](mailto:kushagrasingh.bisen@ugent.be) or open an issue in the [Heimdall repository](https://github.com/SolidLabResearch/heimdall/issues).
