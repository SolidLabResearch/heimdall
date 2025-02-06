import { Parser } from "n3";
import * as WebSocket from 'websocket';
import { EventEmitter } from "events";
import * as CONFIG from '../config/ldes_properties.json';
import { LDESPublisher } from "../service/publishing-stream-to-pod/LDESPublisher";
import { find_relevant_streams, hash_string_md5 } from "../utils/Util";
import { QueryHandler } from "./QueryHandler";
import { RSPQLParser } from "../service/parsers/RSPQLParser";
import { QueryRegistry } from "../service/query-registry/QueryRegistry";
import { AggregationFocusExtractor } from "../service/parsers/AggregationFocusExtractor";
import { getAuthenticatedSession } from "@treecg/versionawareldesinldp";
import { accessResource } from "../service/authorization/AccessResource";
import * as AGG_CONFIG from '../config/pod_credentials.json';

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
    public aggregation_publisher: LDESPublisher;
    public logger: any;
    private query_registry: QueryRegistry;
    /**
     * Creates an instance of WebSocketHandler.
     * @param {WebSocket.server} websocket_server - The Websocket server.
     * @param {EventEmitter} event_emitter - The event emitter.
     * @param {LDESPublisher} aggregation_publisher - The LDES Publisher class instance.
     * @param {*} logger - The logger object.
     * @memberof WebSocketHandler
     */
    constructor(websocket_server: WebSocket.server, event_emitter: EventEmitter, aggregation_publisher: LDESPublisher, logger: any) {
        this.aggregation_resource_list = [];
        this.logger = logger;
        this.websocket_server = websocket_server;
        this.event_emitter = event_emitter;
        this.aggregation_publisher = aggregation_publisher;
        this.connections = new Map<string, WebSocket[]>();
        this.parser = new RSPQLParser();
        this.query_registry = new QueryRegistry();
        this.n3_parser = new Parser({ format: 'N-Triples' });
        this.logger.info({}, 'websocket_handler_initialized');
    }

    /**
     * Handle the Websocket server.
     * It retrieves the query from the client and processes it.
     * It also sends the result to the client.
     * It also stores the aggregation event in the Solid Pod of the Solid Stream Aggregator.
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
            const connection = request.accept('solid-stream-aggregator-protocol', request.origin);
            connection.on('message', async (message: WebSocket.Message) => {
                console.log(`Message received from ${connection.remoteAddress}`);
                if (message.type === 'utf8') {
                    const message_utf8 = message.utf8Data;
                    const ws_message = JSON.parse(message_utf8);
                    if (Object.keys(ws_message).includes('query')) {
                        this.logger.info({ query: ws_message.query }, `new_query_received_from_client_ws`);
                        const query_type = ws_message.type;
                        if (query_type === 'historical+live' || query_type === 'live') {
                            this.logger.info({}, `query_preprocessing_started`);
                            const { ldes_query, query_hashed, width } = await this.preprocess_query(ws_message.query);
                            this.logger.info({ query_id: query_hashed }, `query_preprocessed`);
                            this.set_connections(query_hashed, connection);
                            if (await this.if_authenticated()) {
                                if (await this.if_authorized(ldes_query)) {
                                    this.process_query(ldes_query, width, query_type, this.event_emitter, this.logger);
                                }
                            }
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
                                    connection.send(JSON.stringify(ws_message));
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
        this.aggregation_event_publisher();
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
                    connection.send(event.aggregation_event);
                }
            }
        });
    }
    /**
     * Publish the aggregation event to the Solid Pod of the Solid Stream Aggregator.
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
     * Publish the aggregation event to the Solid Pod of the Solid Stream Aggregator.
     * @memberof WebSocketHandler
     */
    public aggregation_event_publisher() {
        this.event_emitter.on('aggregation_event', async (object: string) => {
            const parser = new Parser({ format: 'N-Triples' });
            const aggregation_event = JSON.parse(object)
            const event_quad: any = parser.parse(aggregation_event.aggregation_event);
            this.aggregation_resource_list.push(event_quad);
            if (this.aggregation_resource_list.length == this.aggregation_resource_list_batch_size) {
                await this.aggregation_publisher.publish(this.aggregation_resource_list, aggregation_event.aggregation_window_from, aggregation_event.aggregation_window_to);
                this.aggregation_resource_list = [];
            }
            if (this.aggregation_resource_list.length == 0) {
                this.logger.debug(`No aggregation events to publish.`);
                this.aggregation_publisher.update_latest_inbox(this.aggregation_publisher.lilURL);
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
                client.send(JSON.stringify(result));
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
    public process_query(query: string, width: number, query_type: string, event_emitter: EventEmitter, logger: any) {
        QueryHandler.handle_ws_query(query, width, this.query_registry, this.logger, this.connections, query_type, event_emitter);
    }

    /**
     * Preprocess the query to find the relevant LDES stream from the Type Index of the Solid Pod.
     * @param {string} query - The query to be preprocessed which was received from the client.
     * @returns {Promise<{ ldes_query: string, query_hashed: string, width: number }>} - The preprocessed query (which now contains the LDES stream instead of just the pod), the hashed query and the width of the window.
     * @memberof WebSocketHandler
     */
    public async preprocess_query(query: string): Promise<{ ldes_query: string, query_hashed: string, width: number }> {
        const parsed = this.parser.parse(query);
        const pod_url = parsed.s2r[0].stream_name;
        const interest_metric = new AggregationFocusExtractor(query).extract_focus();
        const streams = await find_relevant_streams(pod_url, interest_metric);
        const ldes_stream = streams[0];
        const ldes_query = query.replace(pod_url, ldes_stream);
        const width = parsed.s2r[0].width;
        const query_hashed = hash_string_md5(ldes_query);
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

    public async if_authenticated() {
        const session = await getAuthenticatedSession({
            webId: AGG_CONFIG.aggregation_pod_web_id,
            password: AGG_CONFIG.aggregation_pod_password,
            email: AGG_CONFIG.aggregation_pod_email,
        })

        if (session) {
            return true;
        }
        else {
            return false;
        }
    }

    public async if_authorized(query: string): Promise<boolean> {
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
        return accessResource('http://localhost:3000/ruben/profile/card#me', 'http://localhost:3000/ruben/medical/aggregation-x/', 'http://localhost:3000/alice/profile/card#me', healthcare_patient_policy, 'http://localhost:3000/ruben/settings/policies/')
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