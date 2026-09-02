# Heimdall 4 Hz raw metrics

Set `HEIMDALL_RESULTS_DIR` to enable instrumentation. Heimdall writes raw rows only; analysis computes all summary statistics. A results directory is single-run: Heimdall refuses to overwrite an existing metric file.

| Operation | Component | Start / end boundary | Correlation ID | Clock | Output |
| --- | --- | --- | --- | --- | --- |
| `websocket_message_received` | WebSocket handler | Receive and parse query message / same instant | query ID and client message ID | epoch | initialization.csv |
| `stream_discovery` | WebSocket handler | immediately before / after `find_relevant_streams` | query ID, resolved stream ID | monotonic + epoch | initialization.csv |
| `query_reuse_check` | QueryRegistry | immediately before / after uniqueness-isomorphism check | query ID | monotonic + epoch | initialization.csv |
| `query_registration` | QueryRegistry | immediately before / after registry insertion | query ID | monotonic + epoch | initialization.csv |
| `service_authentication` | source-Pod access | only when a real source-Pod authentication operation executes | query ID | monotonic + epoch | initialization.csv; otherwise `--` |
| `physical_stream_subscription_created` / `physical_stream_subscription_reused` | SharedStreamRegistry | Physical Solid subscription creation, or attachment to its existing acquisition | stream ID, query ID when applicable | monotonic + epoch | initialization.csv |
| `event_retrieval` | SharedStreamRegistry | immediately before `fetch(object)` / after `response.text()` | Solid notification object URL | monotonic + epoch | event-processing.csv |
| `parsing_timestamp_extraction` | SharedStreamRegistry | immediately before `turtleStringToStore` / timestamp parsed to epoch | event ID, stream ID | monotonic + epoch | event-processing.csv |
| `rsp_insertion` | RSP-JS | canonical RSP-JS boundary | event ID and stream ID | canonical RSP-JS monotonic | event-processing.csv |
| `r2r_first_result` | RSP-JS | start immediately before R2R.execute; end at first emitted binding | query/window IDs | canonical RSP-JS monotonic | window-processing.csv |
| `window_query_processing` | RSP-JS | canonical RSP-JS boundary | query/window IDs | canonical RSP-JS monotonic | window-processing.csv |
| `out_of_order_event` | RSP-JS | one logical stream event | event ID and stream ID | RSP-JS event-time fields | out-of-order.csv |
| `rsp_result_generated` | Heimdall RStream observer | RSP engine emits binding | query/window | metadata only | event-processing.csv |
| `result_delivery_send` | WebSocket handler | immediately before `connection.send` / return from send | SHA-256 of exact outbound payload | monotonic + server epoch | result-dispatch.csv |

RSP-JS runs with `max_delay: 30000` only while this evaluation mode is enabled. It remains the canonical source for insertion, window-processing, and out-of-order metrics; Heimdall does not reproduce their timing or classification. `out-of-order.csv` includes `event_time_ms`, `reference_time_ms`, `lateness_ms`, `max_out_of_orderness_ms`, and `within_bound` exactly as provided by RSP-JS.

Heimdall does not perform service discovery: the evaluation client already has its configured Heimdall WebSocket URL. Therefore no `service_discovery` row is emitted.

The 4 Hz evaluation delivers results directly to subscribed clients over WebSocket. It does not register or invoke the legacy aggregation-event publisher, and does not persist results in a Heimdall-local `aggregation_pod`. The deployed allow-all source-stream path performs no authentication operation, so Heimdall emits no fabricated `service_authentication` duration; downstream statistics must render that value as `--`. If a future evaluation executes real source-Pod authentication, only that operation may produce the metric.

Required/optional environment variables are `HEIMDALL_RESULTS_DIR` (enables output), `HEIMDALL_RUN_ID`, `HEIMDALL_APPROACH` (default `heimdall`), `HEIMDALL_CLIENT_ID`, and `HEIMDALL_RESOURCE_INTERVAL_MS` (default `500`). The evaluation depends on RSP-JS revision `56e773d8416f978d82a8288802532cabdf8ffef6`, which is installed from its public Git repository and built by `npm run build`. Evaluation outputs are `heimdall.log`, `resource.csv`, `initialization.csv`, `event-processing.csv`, `window-processing.csv`, `result-dispatch.csv`, `out-of-order.csv`, and `run-metadata.json` under the results directory.
