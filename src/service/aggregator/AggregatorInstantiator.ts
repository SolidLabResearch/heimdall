import { RSPEngine } from "rsp-js";
import { RSPQLParser } from "../parsers/RSPQLParser";
import { DecentralizedFileStreamer } from "./DecentralizedFileStreamer";
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from "events";
import * as CREDENTIALS from '../../config/PodToken.json';
import { BindingsWithTimestamp } from "../../utils/Types";
import { hash_string_md5 } from "../../utils/Util";
import { Credentials, aggregation_object } from "../../utils/Types";
import { NotificationStreamProcessor } from "./NotificationStreamProcessor";
import { N3ReasonerService } from "../reasoner/N3Reasoner";
const WebSocketClient = require('websocket').client;
const websocketConnection = require('websocket').connection;
const parser = new RSPQLParser();
/**
 * Class for the Aggregator Instantiator.
 * @class AggregatorInstantiator
 */
export class AggregatorInstantiator {
    public query: string;
    public rules: string;
    public rsp_engine: RSPEngine;
    public rsp_emitter: EventEmitter;
    public event_emitter: EventEmitter;
    public from_date: Date;
    public stream_array: string[];
    public hash_string: string;
    public logger: any;
    public to_date: Date;
    public client = new WebSocketClient();
    public connection: typeof websocketConnection;
    /**
     * Creates an instance of AggregatorInstantiator.
     * @param {string} query - The RSPQL query.
     * @param {string} rules - The rules for the query.
     * @param {number} from_timestamp - The timestamp from where the query is to be executed.
     * @param {number} to_timestamp - The timestamp to where the query is to be executed.
     * @param {*} logger - The logger object.
     * @param {string} query_type - The type of the query (either 'historical+live' or just 'live').
     * @param {any} event_emitter - The event emitter object.
     * @memberof AggregatorInstantiator
     */
    public constructor(query: string, rules: string, from_timestamp: number, to_timestamp: number, logger: any, query_type: string, event_emitter: any) {
        this.query = query;
        this.rules = rules;
        this.logger = logger;
        this.event_emitter = event_emitter;
        this.hash_string = hash_string_md5(query);
        this.rsp_engine = new RSPEngine(query);
        this.from_date = new Date(from_timestamp);
        this.to_date = new Date(to_timestamp);
        this.stream_array = [];
        this.connection = websocketConnection;
        parser.parse(this.query).s2r.forEach((stream) => {
            this.stream_array.push(stream.stream_name);
        });
        this.rsp_emitter = this.rsp_engine.register();
        this.initializeProcessing(query_type);
    }

    /**
     * Initialize the processing of the query.
     * @param {string} query_type - The type of the query (either 'historical+live' or just 'live').
     * @returns {Promise<boolean>} - Returns true if the processing is successful, otherwise false.
     * @memberof AggregatorInstantiator
     */
    public async initializeProcessing(query_type: string): Promise<boolean> {
        const query_hashed = hash_string_md5(this.query);
        this.logger.info({}, 'stream_processing_from_solid_pod_initialized');
        if (this.stream_array.length !== 0) {
            if (query_type === 'historical+live') {
                for (const stream of this.stream_array) {
                    const session_credentials = this.get_session_credentials(stream);
                    this.logger.info({ query_hashed }, `stream_credentials_retrieved`);
                    new DecentralizedFileStreamer(stream, session_credentials, this.from_date, this.to_date, this.rsp_engine, this.query, this.logger);
                }
                this.subscribeRStream();
                return true;
            }
            else if (query_type === 'live') {
                console.log(`The query type is live.`);
                for (const stream of this.stream_array) {
                    this.logger.info({ query_hashed }, `stream_credentials_retrieved`);
                    new NotificationStreamProcessor(stream, this.logger, this.rsp_engine, this.event_emitter);
                }
                this.subscribeRStream();
                return true;
            }
            else {
                throw new Error('The query type is not currently supported by the Solid Stream Aggregator.');
            }
        }
        else {
            console.log(`The stream array is empty. The query is not valid.`);
            return false;
        }
    }

    /**
     * Subscribe to the RStream of the RSP Engine to listen to the bindings, i.e the generated aggregation events and send it to the Solid Stream Aggregator's Websocket server for further processing (i.e publishing to the Solid Pod & sending to the clients).
     * @memberof AggregatorInstantiator
     */
    public async subscribeRStream() {
        this.connect_with_server('ws://localhost:8080/').then(() => {
            console.log(`The connection with the websocket server has been established.`);
            this.connection.connected = true;
        });
        this.client.on('connect', (connection: typeof websocketConnection) => {
            console.log(`The connection with the server has been established. ${connection.connected}`);
            this.rsp_emitter.on('RStream', async (object: BindingsWithTimestamp) => {
                const window_timestamp_from = object.timestamp_from;
                const window_timestamp_to = object.timestamp_to;
                const iterable = object.bindings.values();
                console.log(object.bindings.size);
                for (const item of iterable) {
                    const aggregation_event_timestamp = new Date().getTime();
                    const data = item.value;
                    const aggregation_event = this.generate_aggregation_event(data, aggregation_event_timestamp, this.stream_array, window_timestamp_from, window_timestamp_to);
                    const reasoner = new N3ReasonerService(this.rules);
                    const reasoned_result = await reasoner.reason(aggregation_event);
                    const aggregation_object: aggregation_object = {
                        query_hash: this.hash_string,
                        aggregation_event: reasoned_result,
                        aggregation_window_from: this.from_date,
                        aggregation_window_to: this.to_date,
                    };
                    const aggregation_object_string = JSON.stringify(aggregation_object);
                    this.sendToServer(aggregation_object_string);
                    this.logger.info({}, 'aggregation_event_sent_to_solid_stream_aggregator_websocket_server');
                }
            })
        });
    }

    // TODO : add extra projection variables to the aggregation event.
    // Relevant Issue : https://github.com/SolidLabResearch/solid-stream-aggregator/issues/34
    /**
     * Generate an aggregation event.
     * @param {string} value - The value of the aggregation event.
     * @param {number} event_timestamp - The timestamp of the aggregation event when it was generated.
     * @param {(string[] | undefined)} stream_array - The array of streams that the aggregation event is generated from.
     * @param {number} timestamp_from - The timestamp of the start of the aggregation window.
     * @param {number} timestamp_to -  The timestamp of the end of the aggregation window.
     * @returns {string} - The aggregation event in string RDF.
     * @memberof AggregatorInstantiator
     */
    generate_aggregation_event(value: string, event_timestamp: number, stream_array: string[] | undefined, timestamp_from: number, timestamp_to: number): string {
        if (stream_array === undefined) {
            throw new Error("The stream array is undefined. ");
        }
        else {
            const timestamp_date = new Date(event_timestamp).toISOString();
            const timestamp_from_date = new Date(timestamp_from).toISOString();
            const timestamp_to_date = new Date(timestamp_to).toISOString();
            const uuid_random = uuidv4();
            let aggregation_event = `
        <https://rsp.js/aggregation_event/${uuid_random}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://saref.etsi.org/core/Measurement> .
        <https://rsp.js/aggregation_event/${uuid_random}> <https://saref.etsi.org/core/hasTimestamp> "${timestamp_date}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        <https://rsp.js/aggregation_event/${uuid_random}> <https://saref.etsi.org/core/hasValue> "${value}"^^<http://www.w3.org/2001/XMLSchema#float> .
        <https://rsp.js/aggregation_event/${uuid_random}> <http://www.w3.org/ns/prov#wasDerivedFrom> <https://argahsuknesib.github.io/asdo/AggregatorService> .
        <https://rsp.js/aggregation_event/${uuid_random}> <http://w3id.org/rsp/vocals-sd#startedAt> "${timestamp_from_date}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        <https://rsp.js/aggregation_event/${uuid_random}> <http://w3id.org/rsp/vocals-sd#endedAt> "${timestamp_to_date}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `;
            for (const stream of stream_array) {
                aggregation_event += `<https://rsp.js/aggregation_event/${uuid_random}> <http://www.w3.org/ns/prov#generatedBy> <${stream}> .`
            }
            return aggregation_event;
        }
    }
    /**
     * Connect with the Websocket server of the Solid Stream Aggregator.
     * @param {string} wssURL - The URL of the Websocket server of the Solid Stream Aggregator.
     * @memberof AggregatorInstantiator
     */
    async connect_with_server(wssURL: string) {
        this.client.connect(wssURL, 'solid-stream-aggregator-protocol');
        this.client.on('connectFailed', (error: Error) => {
            console.log('Connect Error: ' + error.toString());
        });
        this.client.setMaxListeners(Infinity);
        this.client.on('connect', (connection: typeof websocketConnection) => {
            this.connection = connection;
        });
    }
    /**
     * Send a message to the Websocket server of the Solid Stream Aggregator.
     * @param {string} message - The message to be sent.
     * @memberof AggregatorInstantiator
     */
    sendToServer(message: string) {
        if (this.connection.connected) {
            this.connection.sendUTF(message);
        }
        else {
            this.connect_with_server('ws://localhost:8080/').then(() => {
                console.log(`The connection with the websocket server was not established. It is now established.`);
            });
        }
    }
    /**
     * Get the session credentials for the Solid Pod.
     * @param {string} stream_name - The name of the stream (i.e the LDES in LDP of the Solid Pod).
     * @returns {Credentials} - The session credentials.
     * @memberof AggregatorInstantiator
     */
    get_session_credentials(stream_name: string) {
        const credentials: Credentials = CREDENTIALS;
        const session_credentials = credentials[stream_name];
        return session_credentials;
    }

}
