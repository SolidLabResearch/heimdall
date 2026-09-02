import { storeToString } from "@treecg/versionawareldesinldp";
import { QueryRegistry } from "../service/query-registry/QueryRegistry";
import { AggregationDispatcher } from "../service/result-dispatcher/AggregationDispatcher";
import { RequestBody } from "../utils/Types";
import { hash_string_md5 } from "../utils/Util";
import { HEIMDALL_WEBSOCKET_PROTOCOL } from "./websocketProtocols";
import * as HEIMDALL_SETUP from '../config/heimdall_setup.json';
import { resolveHeimdallWebSocketUrl } from '../config/heimdallConfig';
const websocketConnection = require('websocket').connection;
const WebSocketClient = require('websocket').client;
const N3 = require('n3');
/**
 * Class for handling the POST request from the client.
 * @class QueryHandler
 */
export class QueryHandler {
    static connection: typeof websocketConnection;
    public static client: any;
    static request_body: RequestBody;
    /**
     * Creates an instance of QueryHandler.
     * @memberof QueryHandler
     */
    constructor() {
        QueryHandler.connection = websocketConnection;
        QueryHandler.client = new WebSocketClient();
    }

    /**
     * Handle the Websocket query from the client.
     * It checks if the query is unique and if it is, then it registers the query in the QueryRegistry and if it is not, then it sends the aggregated events to the client.
     * The non unique query is the query that is already registered in the QueryRegistry, and it uses the Function Ontology Description from Heimdall's Solid Pod
     * To get the aggregated events and send them to the client.
     * @static
     * @param {string} query - The query to be handled (in RSPQL).
     * @param {number} width - The width of the window.
     * @param {QueryRegistry} query_registry - The QueryRegistry object.
     * @param {*} logger - The logger object.
     * @param {any} websocket_connections - The Websocket connections.
     * @param {string} query_type - The type of the query (either historical+live or live).
     * @param {any} event_emitter - The event emitter object.
     * @memberof QueryHandler
     */
    public static async handle_ws_query(query: string, width: number, query_registry: QueryRegistry, logger: any, websocket_connections: any, query_type: string, event_emitter: any, client_id?: string): Promise<string> {
        const aggregation_dispatcher = new AggregationDispatcher(query);
        const to_timestamp = new Date().getTime(); // current time
        const from_timestamp = new Date(to_timestamp - (width)).getTime(); // latest seconds ago
        const query_hashed = hash_string_md5(query);
        const registration = await query_registry.register_query(query, query_registry, from_timestamp, to_timestamp, logger, query_type, event_emitter, client_id);
        await registration.ready;
        if (registration.unique) {
            console.log(`The query is unique.`);
            logger.info({ query_id: query_hashed }, `unique_query_registered`);
        } else {
            logger.info({ query_id: query_hashed }, `non_unique_query_registered`);
            for (const [query, connections] of websocket_connections) {
                // make it work such that you get the messages directly rather than the location of the websocket connection.
                if (query === query_hashed) {
                    for (const connection of connections) {
                        connection.send(JSON.stringify(`{
                            "type": "status",
                            "status": "duplicate_query",
                            "connection_id": ${connection}
                        }`));
                        logger.info({ query_id: query_hashed }, `duplicate_query`);
                    }
                }
                else {
                    const aggregated_events_exist = await aggregation_dispatcher.if_aggregated_events_exist();
                    if (aggregated_events_exist) {
                        logger.info({ query_id: query_hashed }, 'aggregated_events_exist_for_query_in_heimdall_pod');
                        const aggregation_stream = await aggregation_dispatcher.dispatch_aggregated_events({});
                        aggregation_stream.on('data', async (data) => {
                            const store = new N3.Store(data.quads);
                            const aggregation_event = storeToString(store)
                            const object = {
                                query_hash: hash_string_md5(query),
                                aggregation_event: aggregation_event,
                            }
                            const object_string = JSON.stringify(object);
                            this.sendToServer(object_string);
                        });
                    }
                    else {
                        console.log(`The aggregated events do not exist.`);
                    }
                }
            }
        }
        return registration.executionId;

    }
    /**
     * Connect with Heimdall's WebSocket server.
     * @static
     * @param {string} wssURL - The URL of the Websocket server.
     * @memberof QueryHandler
     */
    static async connect_with_server(wssURL: string) {
        this.client.connect(wssURL, HEIMDALL_WEBSOCKET_PROTOCOL);
        this.client.on('connect', (connection: typeof websocketConnection) => {
            QueryHandler.connection = connection;
        });
        this.client.setMaxListeners(Infinity);
        this.client.on('connectFailed', (error: Error) => {
            console.log('Connect Error: ' + error.toString());
        });
    }
    /**
     * Send a message to Heimdall's WebSocket server.
     * @static
     * @param {string} message - The message to be sent to the server.
     * @memberof QueryHandler
     */
    static sendToServer(message: string) {
        if (this.connection.connected) {
            this.connection.sendUTF(message);
        }
        else {
            this.connect_with_server(resolveHeimdallWebSocketUrl(HEIMDALL_SETUP)).then(() => {
                console.log(`The connection with the websocket server was not established. It is now established.`);
            });
        }
    }
}
