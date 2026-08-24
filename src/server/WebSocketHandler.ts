import { Parser } from "n3";
import * as WebSocket from 'websocket';
import { EventEmitter } from "events";
import * as CONFIG from '../config/ldes_properties.json';
import type { LDESPublisher } from "../service/publishing-stream-to-pod/LDESPublisher";
import { find_relevant_streams, hash_string_md5 } from "../utils/Util";
import { QueryHandler } from "./QueryHandler";
import { RSPQLParser } from "../service/parsers/RSPQLParser";
import { QueryRegistry } from "../service/query-registry/QueryRegistry";
import { AggregationFocusExtractor } from "../service/parsers/AggregationFocusExtractor";
import { getAuthenticatedSession } from "@treecg/versionawareldesinldp";
import { accessResource } from "../service/authorization/AccessResource";
import * as AGG_CONFIG from '../config/pod_credentials.json';
import {
    HEIMDALL_WEBSOCKET_PROTOCOL,
    LEGACY_WEBSOCKET_PROTOCOL,
    resolveAcceptedWebSocketProtocol,
} from "./websocketProtocols";
import { MetricWriter } from '../evaluation/MetricWriter';
import { createHash } from 'crypto';

/**
 * Class for handling the Websocket server.
 * @class WebSocketHandler
 */
export class WebSocketHandler {

    private aggregation_resource_list: any[];
    private readonly aggregation_resource_list_batch_size: number = CONFIG.BUCKET_SIZE;
    private connections: Map<string, WebSocket[]>;
    private parser: RSPQLParser;
    private n3_parser: Parser;
    public websocket_server: WebSocket.server;
    public event_emitter: EventEmitter;
    public aggregation_publisher?: LDESPublisher;
    public logger: any;
    private query_registry: QueryRegistry;
    private readonly metric_writer: MetricWriter;
    private aggregationPublisherRegistered = false;
    /**
     * Creates an instance of WebSocketHandler.
     * @param {WebSocket.server} websocket_server - The Websocket server.
     * @param {EventEmitter} event_emitter - The event emitter.
     * @param {LDESPublisher} aggregation_publisher - The LDES Publisher class instance.
     * @param {*} logger - The logger object.
     * @memberof WebSocketHandler
     */
    constructor(websocket_server: WebSocket.server, event_emitter: EventEmitter, aggregation_publisher: LDESPublisher | undefined, logger: any, metric_writer: MetricWriter = new MetricWriter()) {
        this.aggregation_resource_list = [];
        this.logger = logger;
        this.websocket_server = websocket_server;
        this.event_emitter = event_emitter;
        this.aggregation_publisher = aggregation_publisher;
        this.connections = new Map<string, WebSocket[]>();
        this.parser = new RSPQLParser();
        this.metric_writer = metric_writer;
        this.query_registry = new QueryRegistry(metric_writer);
        this.n3_parser = new Parser({ format: 'N-Triples' });
        this.logger.info({}, 'websocket_handler_initialized');
    }

    /**
     * Handle the Websocket server.
     * It retrieves the query from the client and processes it.
     * It also sends the result to the client.
     * Evaluation results are delivered directly to subscribed clients. Legacy
     * Solid Pod publishing remains available as an explicit, non-evaluation
     * method but is not registered here.
     * @memberof WebSocketHandler
     */
    public handle_wss() {
        // TODO: find the type of the request object
        console.log(`Handling the websocket server.`);
        this.logger.info({}, 'handling_websocket_server');
        this.websocket_server.on('connect', (request: any) => {
            console.log(`Connection received from ${request.remoteAddress}`);
        });
        this.websocket_server.on('request', async (request: any) => {
            const acceptedProtocol = resolveAcceptedWebSocketProtocol(request.requestedProtocols);
            if (acceptedProtocol === null) {
                request.reject(1002, `Unsupported WebSocket protocol. Supported protocols: ${HEIMDALL_WEBSOCKET_PROTOCOL}, ${LEGACY_WEBSOCKET_PROTOCOL}`);
                return;
            }
            const connection = request.accept(acceptedProtocol, request.origin);
            connection.on('message', async (message: WebSocket.Message) => {
                console.log(`Message received from ${connection.remoteAddress}`);
                if (message.type === 'utf8') {
                    const message_utf8 = message.utf8Data;
                    const ws_message = JSON.parse(message_utf8);
                    if (Object.keys(ws_message).includes('query')) {
                        const message_id = ws_message.message_id || ws_message.query_id || hash_string_md5(message_utf8);
                        const received_epoch_ms = Date.now();
                        this.metric_writer.record('initialization.csv', 'websocket_message_received', {
                            client_id: ws_message.client_id,
                            message_id,
                            start_epoch_ms: received_epoch_ms,
                            end_epoch_ms: received_epoch_ms,
                            duration_ms: 0,
                        });
                        this.logger.info({ query: ws_message.query }, `new_query_received_from_client_ws`);
                        const query_type = ws_message.type;
                        if (query_type === 'historical+live' || query_type === 'live') {
                            this.logger.info({}, `query_preprocessing_started`);
                            const { ldes_query, query_hashed, width } = await this.preprocess_query(ws_message.query, ws_message.client_id);
                            this.logger.info({ query_id: query_hashed }, `query_preprocessed`);
                            this.set_connections(query_hashed, connection);
                            this.process_query(ldes_query, width, query_type, this.event_emitter, ws_message.client_id);
                        }
                        else {
                            throw new Error(`The type of Query is not supported/handled. The type of query is: ${ws_message.type}`);
                        }
                    }
                    else if (Object.keys(ws_message).includes('aggregation_event')) {
                        this.logger.info({ query_id: ws_message.query_hash }, `aggregation_event_received_now_publishing_to_client_ws`);
                        const query_hash = ws_message.query_hash;
                        for (const [query, connections] of this.connections) {
                            if (query === query_hash) {
                                for (const connection of connections) {
                                    const outbound = JSON.stringify(ws_message);
                                    const start_epoch_ms = Date.now();
                                    const start_monotonic_ns = process.hrtime.bigint();
                                    connection.send(outbound);
                                    this.metric_writer.timed('result-dispatch.csv', 'result_delivery_send', {
                                        query_id: query_hash,
                                        result_id: createHash('sha256').update(outbound).digest('hex'),
                                        server_send_epoch_ms: start_epoch_ms,
                                    }, start_epoch_ms, start_monotonic_ns);
                                }
                            }
                        }
                    }
                    else if (Object.keys(ws_message).includes('status')) {
                        const query_hash = ws_message.query_hash;
                        for (const [query, connections] of this.connections) {
                            if (query === query_hash) {
                                for (const connection of connections) {
                                    connection.send(JSON.stringify(ws_message));
                                }
                            }
                        }
                    }
                    else if (Object.keys(ws_message).includes('type')) {
                        console.log(ws_message);
                    }
                    else {
                        throw new Error('Unknown message, not handled.');
                    }
                }
            });
            connection.on('close', (reason_code: string, description: string) => {
                this.logger.debug(`Connection closed from ${connection.remoteAddress}: ${reason_code} - ${description}`);
            });
            connection.on('error', (error: Error) => {
                this.logger.debug(`Error in connection from ${connection.remoteAddress}: ${error}`);
            });
        });
        this.client_response_publisher();
    }

    /**
     * Send the aggregation event to the client's Websocket channel.
     * @memberof WebSocketHandler
     */
    public async client_response_publisher() {
        this.event_emitter.on('aggregation_event', (object: string) => {
            const event = JSON.parse(object)
            const query_id = event.query_hash;
            const connections = this.connections.get(query_id);
            if (connections !== undefined) {
                for (const connection of connections) {
                    const start_epoch_ms = Date.now();
                    const start_monotonic_ns = process.hrtime.bigint();
                    const outbound = event.aggregation_event;
                    connection.send(outbound);
                    this.metric_writer.timed('result-dispatch.csv', 'result_delivery_send', {
                        query_id,
                        result_id: createHash('sha256').update(outbound).digest('hex'),
                        server_send_epoch_ms: start_epoch_ms,
                    }, start_epoch_ms, start_monotonic_ns);
                }
            }
        });
    }
    /**
     * Publish the aggregation event to Heimdall's Solid Pod.
     * @param {*} aggregation_event - The aggregation event to be published.
     * @param {LDESPublisher} aggregation_publisher - The LDES Publisher class instance.
     * @memberof WebSocketHandler
     */
    public publish_aggregation_event(aggregation_event: any, aggregation_publisher: LDESPublisher) {
        let zeroLengthDuration: number = 0;
        let intervalId: any | null = null;
        const event_quad: any = this.n3_parser.parse(aggregation_event.aggregation_event);
        this.aggregation_resource_list.push(event_quad);

        if (this.aggregation_resource_list.length === this.aggregation_resource_list_batch_size) {
            this.logger.info({ query_id: aggregation_event.query_hash }, `publishing_aggregation_event_bucket`);
            aggregation_publisher.publish(
                this.aggregation_resource_list,
                aggregation_event.aggregation_window_from,
                aggregation_event.aggregation_window_to
            );
            this.aggregation_resource_list = [];
        }

        if (this.aggregation_resource_list.length === 0) {
            this.logger.debug(`No aggregation events to publish.`);
        }

        const checkInterval: number = 500; // Check every 500 milliseconds
        intervalId = setInterval(() => {
            if (this.aggregation_resource_list.length === 0) {
                zeroLengthDuration += 500; // Increment the duration by the check interval

                if (zeroLengthDuration >= 5000) {
                    this.logger.info({ query_id: aggregation_event.query_hash }, `aggregation_publishing_has_been_done`);
                    clearInterval(intervalId!); // Clear the interval when threshold reached
                    zeroLengthDuration = 0; // Reset the duration
                }
            } else {
                zeroLengthDuration = 0; // Reset the duration when events are present
            }
        }, checkInterval);
    }
    /**
     * Publish the aggregation event to Heimdall's Solid Pod.
     * @memberof WebSocketHandler
     */
    public aggregation_event_publisher() {
        if (this.aggregationPublisherRegistered) return;
        this.aggregationPublisherRegistered = true;
        this.event_emitter.on('aggregation_event', async (object: string) => {
            const parser = new Parser({ format: 'N-Triples' });
            const aggregation_event = JSON.parse(object)
            const event_quad: any = parser.parse(aggregation_event.aggregation_event);
            this.aggregation_resource_list.push(event_quad);
            if (this.aggregation_resource_list.length == this.aggregation_resource_list_batch_size) {
                if (!this.aggregation_publisher) {
                    throw new Error('Aggregation publishing is not configured for this handler.');
                }
                await this.aggregation_publisher.publish(this.aggregation_resource_list, aggregation_event.aggregation_window_from, aggregation_event.aggregation_window_to);
                this.aggregation_resource_list = [];
            }
            if (this.aggregation_resource_list.length == 0) {
                this.logger.debug(`No aggregation events to publish.`);
                if (this.aggregation_publisher) {
                    this.aggregation_publisher.update_latest_inbox(this.aggregation_publisher.lilURL);
                }
            }
        });

        this.event_emitter.on('close', () => {
            this.logger.debug(`Closing the aggregation event publisher.`);
        });

        this.event_emitter.on('error', (error: Error) => {
            this.logger.debug(`Error in aggregation event publisher: ${error}`);
            this.event_emitter.on('error', (error: Error) => {
                this.logger.debug(`Error in aggregation event publisher: ${error}`);
            });

            this.event_emitter.on('end', () => {
                this.logger.debug(`End of aggregation event publisher.`);
            });
        });
    }
    /**
     * Send the result to the client for the given query.
     * @param {string} query_id - The id of the query.
     * @param {*} result - The result to be sent (the aggregation result).
     * @memberof WebSocketHandler
     */
    public send_result_to_client(query_id: string, result: any) {
        const websocket_clients = this.connections.get(query_id);
        if (websocket_clients !== undefined) {
            for (const client of websocket_clients) {
                const outbound = JSON.stringify(result);
                const start_epoch_ms = Date.now();
                const start_monotonic_ns = process.hrtime.bigint();
                client.send(outbound);
                this.metric_writer.timed('result-dispatch.csv', 'result_delivery_send', {
                    query_id,
                    result_id: createHash('sha256').update(outbound).digest('hex'),
                    server_send_epoch_ms: start_epoch_ms,
                }, start_epoch_ms, start_monotonic_ns);
            }
        }
        else {
            console.log(`There is no websocket connection available for the query`);
            this.logger.debug(`No connection found for query id: ${query_id}`);
        }
    }
    /**
     * Process the query and send the result to the client.
     * @param {string} query - The query to be processed (RSP-QL query).
     * @param {number} width - The width of the window to be processed.
     * @param {string} query_type - The type of the query (historical+live or live).
     * @param {EventEmitter} event_emitter - The event emitter object.
     * @memberof WebSocketHandler
     */
    public process_query(query: string, width: number, query_type: string, event_emitter: EventEmitter, client_id?: string) {
        QueryHandler.handle_ws_query(query, width, this.query_registry, this.logger, this.connections, query_type, event_emitter, client_id);
    }

    /**
     * Preprocess the query to find the relevant LDES stream from the Type Index of the Solid Pod.
     * @param {string} query - The query to be preprocessed which was received from the client.
     * @returns {Promise<{ ldes_query: string, query_hashed: string, width: number }>} - The preprocessed query (which now contains the LDES stream instead of just the pod), the hashed query and the width of the window.
     * @memberof WebSocketHandler
     */
    public async preprocess_query(query: string, client_id?: string): Promise<{ ldes_query: string, query_hashed: string, width: number }> {
        const parsed = this.parser.parse(query);
        if (parsed.s2r.length === 0) {
            throw new Error('Cannot preprocess query without a STREAM reference');
        }

        // Queries with multiple STREAM references already identify their LDES
        // containers. Preserve the complete query, including every stream URL.
        // Type Index discovery is only applicable to the legacy single-source
        // form where that source represents a Solid Pod.
        if (parsed.s2r.length > 1) {
            const width = parsed.s2r[0].width;
            const query_hashed = hash_string_md5(query);
            return { ldes_query: query, query_hashed, width };
        }

        const pod_url = parsed.s2r[0].stream_name;
        const interest_metric = new AggregationFocusExtractor(query).extract_focus();
        const start_epoch_ms = Date.now();
        const start_monotonic_ns = process.hrtime.bigint();
        const streams = await find_relevant_streams(pod_url, interest_metric);
        const ldes_stream = streams[0];
        if (ldes_stream === undefined) {
            throw new Error(`No relevant LDES stream found for Pod source ${pod_url}`);
        }
        const ldes_query = query.replace(pod_url, ldes_stream);
        const width = parsed.s2r[0].width;
        const query_hashed = hash_string_md5(ldes_query);
        this.metric_writer.timed('initialization.csv', 'stream_discovery', { client_id, query_id: query_hashed, stream_id: ldes_stream }, start_epoch_ms, start_monotonic_ns);
        return { ldes_query, query_hashed, width };
    }
    /**
     * Set the connections for the given query.
     * @param {string} query_hashed - The hashed query.
     * @param {WebSocket} connection - The Websocket connection to be set for the query (to be associated with the query).
     * @returns {void} - Nothing, just sets the connection for the query in the connections map.
     * @memberof WebSocketHandler
     */
    public set_connections(query_hashed: string, connection: WebSocket): void {
        if (!this.connections.has(query_hashed)) {
            this.connections.set(query_hashed, [connection]);
        }
        else {
            const connections = this.connections.get(query_hashed);
            if (connections !== undefined) {
                connections.push(connection);
                this.connections.set(query_hashed, connections);
            }
        }
        this.logger.info({ query_id: query_hashed }, `websocket_connection_set_for_query`);
    }

    /**
     * Legacy aggregation-pod authentication check. It is retained for older
     * callers, but the 4 Hz evaluation path does not invoke it because source
     * streams are accessed anonymously under the deployed allow-all setup.
     * @returns {Promise<boolean>} Whether the configured session can authenticate.
     */
    public async if_authenticated(client_id?: string, query_id?: string): Promise<boolean> {
        const start_epoch_ms = Date.now();
        const start_monotonic_ns = process.hrtime.bigint();
        const session = await getAuthenticatedSession({
            webId: AGG_CONFIG.aggregation_pod_web_id,
            password: AGG_CONFIG.aggregation_pod_password,
            email: AGG_CONFIG.aggregation_pod_email,
        })

        const authenticated = Boolean(session);
        this.metric_writer.timed('initialization.csv', 'service_authentication', { client_id, query_id }, start_epoch_ms, start_monotonic_ns);
        return authenticated;
    }

    /**
     * Check whether the static healthcare policy authorizes the request.
     * @returns {Promise<boolean>} Whether the request is authorized.
     */
    public async if_authorized(client_id?: string, query_id?: string): Promise<boolean> {
        const start_epoch_ms = Date.now();
        const start_monotonic_ns = process.hrtime.bigint();
        const healthcare_patient_policy =
            `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX eu-gdpr: <https://w3id.org/dpv/legal/eu/gdpr#>
PREFIX oac: <https://w3id.org/oac#>
PREFIX odrl: <http://www.w3.org/ns/odrl/2/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

PREFIX ex: <http://example.org/>

<http://example.org/HCPX-request> a odrl:Request ;
  odrl:uid ex:HCPX-request ;
  odrl:profile oac: ;
  dcterms:description "HCP X requests to read Alice's health data for bariatric care.";
  odrl:permission <http://example.org/HCPX-request-permission> .

<http://example.org/HCPX-request-permission> a odrl:Permission ;
  odrl:action odrl:read ;
  odrl:target <http://localhost:3000/ruben/medical/aggregation-x/> ;
  odrl:assigner <http://localhost:3000/ruben/profile/card#me> ;
  odrl:assignee <http://localhost:3000/alice/profile/card#me> ;
  odrl:constraint <http://example.org/HCPX-request-permission-purpose>,
      <http://example.org/HCPX-request-permission-lb> .

<http://example.org/HCPX-request-permission-purpose> a odrl:Constraint ;
  odrl:leftOperand odrl:purpose ; # can also be oac:Purpose, to conform with OAC profile
  odrl:operator odrl:eq ;
  odrl:rightOperand ex:aggregation .

<http://example.org/HCPX-request-permission-lb> a odrl:Constraint ;
  odrl:leftOperand oac:LegalBasis ;
  odrl:operator odrl:eq ;
  odrl:rightOperand eu-gdpr:A9-2-a .`;
        const authorized = await accessResource('http://localhost:3000/ruben/profile/card#me', 'http://localhost:3000/ruben/medical/aggregation-x/', 'http://localhost:3000/alice/profile/card#me', healthcare_patient_policy, 'http://localhost:3000/ruben/settings/policies/');
        this.metric_writer.timed('initialization.csv', 'service_authorization', { client_id, query_id }, start_epoch_ms, start_monotonic_ns);
        return authorized;
        // const parsed = this.parser.parse(query);
        // const pod_url = parsed.s2r[0].stream_name;
        // console.log(`Checking if the user is authorized to access the stream: ${pod_url}`);

        // // const streams = await find_relevant_streams(pod_url, 'author');
        // // if (streams.length > 0) {
        // //     return true;
        // // }
        // // else {
        // //     return false;
        // // }
    }
}
