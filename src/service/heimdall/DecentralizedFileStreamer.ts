import { QueryEngine } from "@comunica/query-sparql";
import { LDESinLDP, LDPCommunication, SolidCommunication } from "@treecg/versionawareldesinldp";
import { RDFStream, RSPEngine } from "rsp-js";
import { Bindings } from '@comunica/types';
import { StreamEventQueue } from "../../utils/StreamEventQueue";
const { Store } = require('n3');
const websocketConnection = require('websocket').connection;
const WebSocketClient = require('websocket').client;
import { Quad } from "n3";
import { QuadWithID } from "../../utils/Types";
import { session_with_credentials } from "../../utils/authentication/CSSAuthentication";
import { readMembersRateLimited } from "../../utils/ldes-in-ldp/EventSource";
import { RateLimitedLDPCommunication } from "rate-limited-ldp-communication";
import { hash_string_md5 } from "../../utils/Util";
import { TREE } from "@treecg/ldes-snapshot";
import { Session } from "@inrupt/solid-client-authn-node";
import { create_subscription, extract_ldp_inbox, extract_subscription_server } from "../../utils/notifications/Util";
import * as HEIMDALL_SETUP from '../../config/heimdall_setup.json';
import { resolveHeimdallSetupConfig } from "../../config/heimdallConfig";
import { HEIMDALL_WEBSOCKET_PROTOCOL } from "../../server/websocketProtocols";
/**
 * Class for streaming the events from the Solid Pod to the RSP Engine by reading the events and converting the events stored into files into a stream.
 * @class DecentralizedFileStreamer
 */
export class DecentralizedFileStreamer {
    public ldes_stream: string;
    public from_date: Date;
    public to_date: Date;
    static connection: typeof websocketConnection;
    public static client: any = new WebSocketClient();
    public stream_name: RDFStream | undefined;
    public ldes!: LDESinLDP;
    public comunica_engine: QueryEngine;
    public communication: Promise<SolidCommunication | LDPCommunication | RateLimitedLDPCommunication>;
    public session: any;
    public observation_array: any[];
    public query: string
    public query_hash: string;
    public file_streamer_start_time: number = 0;
    public logger: any
    public notification_listening_time: number = 0;
    public missing_event_queue: StreamEventQueue<Set<Quad>>;
    /**
     * Creates an instance of DecentralizedFileStreamer.
     * @param {string} ldes_stream - The LDES stream URL.
     * @param {session_credentials} session_credentials - The credentials of the Solid Pod.
     * @param {Date} from_date - The start date of the events to be read from the Solid Pod.
     * @param {Date} to_date - The end date of the events to be read from the Solid Pod.
     * @param {RSPEngine} rsp_engine - The RSP Engine.
     * @param {string} query - The query to be executed.
     * @param {*} logger - The logger object.
     * @memberof DecentralizedFileStreamer
     */
    constructor(ldes_stream: string, session_credentials: session_credentials, from_date: Date, to_date: Date, rsp_engine: RSPEngine, query: string, logger: any) {
        this.ldes_stream = ldes_stream;
        this.communication = this.get_communication(session_credentials);
        this.from_date = from_date;
        this.to_date = to_date;
        this.query = query;
        this.logger = logger;
        this.query_hash = hash_string_md5(query);
        this.missing_event_queue = new StreamEventQueue<Set<Quad>>([]);
        this.stream_name = rsp_engine.getStream(this.ldes_stream);
        this.comunica_engine = new QueryEngine();
        this.observation_array = [];
        this.subscribing_latest_events(this.stream_name);
        DecentralizedFileStreamer.connect_with_server('ws://localhost:8080/').then(() => {
            console.log(`The connection with the websocket server was established.`);
        });
        this.initiateDecentralizedFileStreamer().then(() => {
            this.add_missing_events_to_rsp_engine();
        });
    }

    /**
     * Get the communication object with the Solid Pod.
     * @param {session_credentials} credentials - The credentials of the Solid Pod.
     * @returns {Promise<SolidCommunication | LDPCommunication>} - The communication object with the Solid Pod.
     * @memberof DecentralizedFileStreamer
     */
    public async get_communication(credentials: session_credentials) {
        const session = await this.get_session(credentials);
        if (session) {
            return new SolidCommunication(session);
        }
        else {
            return new LDPCommunication();
        }
    }

    /**
     * Adding the events which might have been added between 
     * the start of the file streamer and the start of the websocket
     * to read the new events on the Solid Pod.
     * @memberof DecentralizedFileStreamer
     */
    public async add_missing_events_to_rsp_engine() {
        const stream = await readMembersRateLimited({
            ldes: this.ldes,
            rate: 60,
            communication: await this.communication,
            interval: 1000
        })
        stream.on("data", async (data: QuadWithID) => {
            const stream_store = new Store(data.quads);
            const binding_stream = await this.comunica_engine.queryBindings(`
            PREFIX saref: <https://saref.etsi.org/core/>
            SELECT ?time WHERE {
                ?s saref:hasTimestamp ?time .
            }
            `, {
                sources: [stream_store]
            });

            binding_stream.on('data', async (bindings: Bindings) => {
                const time = bindings.get('time');
                if (time !== undefined) {
                    const timestamp = await this.epoch(time.value);
                    this.missing_event_queue.enqueue(stream_store.getQuads(), timestamp);
                }
            });
        });

        stream.on("end", async () => {
            console.log(`The missing event stream has ended.`);
        });

    }
    /**
     * Initiates the Decentralized File Streamer to read the events from the Solid Pod in between a certain time frame and then subscribe to the latest events from the Solid Pod.
     * @returns {Promise<void>} - The promise that resolves to nothing.
     * @memberof DecentralizedFileStreamer
     */
    public async initiateDecentralizedFileStreamer(): Promise<void> {
        const communication = await this.communication;
        this.ldes = new LDESinLDP(this.ldes_stream, communication);
        const metadata = await this.ldes.readMetadata();
        const bucket_strategy = metadata.getQuads(this.ldes_stream + "#BucketizeStrategy", TREE.path, null, null)[0].object.value;
        this.file_streamer_start_time = Date.now();
        this.logger.info({ query_id: this.query_hash }, `file_streamer_started for ${this.ldes_stream}`)
        const stream = await this.ldes.readMembersSorted({
            from: this.from_date,
            until: this.to_date,
            chronological: true
        });
        this.logger.info({ query_id: this.query_hash }, `file_streamer_ended for ${this.ldes_stream}`)
        if (this.stream_name !== undefined) {
            await this.subscribing_latest_events(this.stream_name);
        }
        stream.on("data", async (data: QuadWithID) => {
            const member_store = new Store(data.quads);
            const timestamp = member_store.getQuads(null, bucket_strategy, null, null)[0].object.value;
            const timestamp_epoch = Date.parse(timestamp);
            if (this.stream_name) {
                this.logger.info({ query_id: this.query_hash }, `event_added_to_rsp_engine for ${this.ldes_stream}`)
                this.add_event_to_rsp_engine(member_store, [this.stream_name], timestamp_epoch);
            }
        });

        stream.on("end", async () => {
            this.logger.info({ query_id: this.query_hash }, `stream events have been fully read and added to the RSP Engine.`);
            console.log(`The stream has been fully read and added to the .`);
            DecentralizedFileStreamer.sendToServer(`{
                "query_hash": "${this.query_hash}",
                "stream_name": "${this.stream_name}",
                "status": "stream_reader_ended"
            }`);
        });

        stream.on("error", async (error: Error) => {
            console.log(`The reading from the solid pod ldes stream has an error: ${error}`);
        });
    }

    /**
     * Adds the event store to the RSP Engine.
     * @param {typeof Store} store - The store of the events.
     * @param {RDFStream[]} stream_name - The RDF Stream where the events are being added to.
     * @memberof DecentralizedFileStreamer
     */
    async add_event_store_to_rsp_engine(store: typeof Store, stream_name: RDFStream[]) {
        const binding_stream = await this.comunica_engine.queryBindings(`
        PREFIX saref: <https://saref.etsi.org/core/>
        SELECT ?time WHERE {
            ?s saref:hasTimestamp ?time .
        }
        `, {
            sources: [store]
        });

        binding_stream.on('data', async (bindings: Bindings) => {
            const time = bindings.get('time');
            if (time !== undefined) {
                const timestamp = await this.epoch(time.value);
                console.log(`Timestamp: ${timestamp}`);
                if (stream_name) {
                    console.log(`Adding Event to ${stream_name}`);
                    await this.add_event_to_rsp_engine(store, stream_name, timestamp);
                }
                else {
                    console.log(`The stream is undefined`);
                }
            }
            else {
                console.log(`The time is undefined`);
            }
        });
    }

    /**
     * Adds the events to the RSP Engine.
     * @param {typeof Store} store - The store of the events.
     * @param {RDFStream[]} stream_name - The RDF Stream where the events are being added to.
     * @param {number} timestamp - The timestamp of the events.
     * @memberof DecentralizedFileStreamer
     */
    async add_event_to_rsp_engine(store: typeof Store, stream_name: RDFStream[], timestamp: number) {
        stream_name.forEach((stream: RDFStream) => {
            const quads = store.getQuads(null, null, null, null);
            for (const quad of quads) {
                stream.add(quad, timestamp);
            }
        });
    }
    /**
     * Converts the date to epoch time.
     * @param {string} date - The date to convert to epoch time.
     * @returns {Promise<number>} - The epoch time.
     * @memberof DecentralizedFileStreamer
     */
    async epoch(date: string): Promise<number> {
        return Date.parse(date);
    }

    /**
     * Subscribes to the latest events of the LDES stream.
     * @param {RDFStream} stream_name - The name of the RDF stream generated from the Solid Pod.
     * @memberof DecentralizedFileStreamer
     */
    async subscribing_latest_events(stream_name: RDFStream | undefined) {
        if (stream_name !== undefined) {
            console.log(`Subscribing to the latest events of the stream`, stream_name);
            const inbox = await extract_ldp_inbox(this.ldes_stream);
            if (inbox !== undefined) {
                const subscription_server = await extract_subscription_server(inbox);
                if (subscription_server !== undefined) {
                    const server = subscription_server.location;
                    const response_subscription = await create_subscription(server, inbox);
                    if (response_subscription) {
                        this.logger.info(`The subscription has been succesful.`);
                    } else {
                        this.logger.error('Error while creating the subscription. The response object is empty.');
                    }
                } else {
                    console.log(`The subscription server is undefined.`);
                    this.logger.error({ query_id: this.query_hash }, `The subscription server is undefined.`);
                }
            } else {
                console.log(`The inbox for subscribing to the latest events is undefined.`);
                this.logger.error({ query_id: this.query_hash }, `The inbox for subscribing to the latest events is undefined.`);
            }
        }
        else {
            this.logger.error(`The stream name is not defined, thus can't subscribe to the latest events.`);
        }
    }


    /**
     * Get the inbox container from the LDP container or return undefined if the inbox container does not exist.
     * @param {string} stream - The LDES in LDP URL.
     * @returns {Promise<string>} - The inbox container URL.
     * @memberof DecentralizedFileStreamer
     */
    async get_inbox_container(stream: string): Promise<string | undefined> {
        console.log(`Getting the inbox container from`, stream);
        const ldes_in_ldp: LDESinLDP = new LDESinLDP(stream, new LDPCommunication());
        const metadata = await ldes_in_ldp.readMetadata();
        for (const quad of metadata) {
            if (quad.predicate.value === 'http://www.w3.org/ns/ldp#inbox') {
                console.log(quad.object.value);
                if (quad.object.value != undefined) {
                    return quad.object.value;
                }
                else {
                    return undefined;
                }
            }
            else {
                return undefined;
            }
        }
    }
    /**
     * Subscribes to the webhook notification of the LDES stream to get the notifications of when new events are being added to the Solid Pod.
     * @param {string} ldes_stream - The LDES stream URL.
     * @returns {Promise<void>} - Subscribes and then the new events are sent to Heimdall's HTTP server.
     * @memberof DecentralizedFileStreamer
     */
    async subscribe_webhook_notification(ldes_stream: string): Promise<void> {
        const heimdallSetupConfig = resolveHeimdallSetupConfig(HEIMDALL_SETUP);
        const solid_server = ldes_stream.split("/").slice(0, 3).join("/");
        const webhook_notification_server = solid_server + "/.notifications/WebhookChannel2023/";
        const post_body = {
            "@context": [],
            "type": "http://www.w3.org/ns/solid/notifications#WebhookChannel2023",
            "topic": `${ldes_stream}`,
            "sendTo": `${heimdallSetupConfig.heimdallHttpServerUrl}`
        };

        const response = await fetch(webhook_notification_server, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/ld+json',
                'Accept': 'application/ld+json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(post_body)
        });
        const response_json = await response.json();
        console.log(response_json.sendTo);
    }

    /**
     * Get the subscription URL for the LDES stream.
     * @param {string} ldes_stream - The LDES stream URL.
     * @returns {Promise<string>} - The subscription URL. 
     * @memberof DecentralizedFileStreamer 
     */
    async get_stream_subscription_url(ldes_stream: string): Promise<string> {
        const solid_server = ldes_stream.split("/").slice(0, 3).join("/");
        const notification_server = solid_server + "/.notifications/WebSocketChannel2023/";
        const post_body = {
            "@context": ["https://www.w3.org/ns/solid/notification/v1"],
            "type": "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
            "topic": `${ldes_stream}`
        }
        const repsonse = await fetch(notification_server, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/ld+json',
                'Accept': 'application/ld+json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(post_body)
        });
        const response_json = await repsonse.json();
        return response_json.receiveFrom;
    }

    /**
     * Add the sorted queue to the RSP Engine and logs the element of the queue by dequeuing it one by one.
     * @param {StreamEventQueue<Set<Quad>>} sorted_queue - The sorted queue of events.
     * @memberof DecentralizedFileStreamer
     */
    async add_sorted_queue_to_rsp_engine(sorted_queue: StreamEventQueue<Set<Quad>>) {
        for (let i = 0; i < sorted_queue.size(); i++) {
            const element = sorted_queue.dequeue();
            if (element !== undefined) {
                const json_element = JSON.parse(JSON.stringify(element));
                for (const quad of json_element.event) {
                    this.stream_name?.add(quad, json_element.timestamp);
                }
            }
        }
    }
    /**
     * Get the inbox subscription websocket URL.
     * @param {string} ldes_stream - The LDES stream URL.
     * @param {string} inbox_container - The inbox container URL.
     * @returns {Promise<string>} - The inbox subscription websocket URL.
     * @memberof DecentralizedFileStreamer
     */
    async get_inbox_subscription_notification_url(ldes_stream: string, inbox_container: string): Promise<string> {
        const solid_server = ldes_stream.split("/").slice(0, 3).join("/");
        const notification_server = solid_server + "/.notifications/WebSocketChannel2023/";
        const post_body = {
            "@context": ["https://www.w3.org/ns/solid/notification/v1"],
            "type": "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
            "topic": `${inbox_container}`
        }
        const repsonse = await fetch(notification_server, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/ld+json',
                'Accept': 'application/ld+json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(post_body)
        })

        const response_json = await repsonse.json();
        return response_json.receiveFrom;
    }
    /**
     * Get the notification listening time when the DecentralizedFileStreamer started to listen to the notifications of when new events were being added to the Solid Pod.
     * @returns {number} - The start of the notification listening time. 
     * @memberof DecentralizedFileStreamer
     */
    get_notification_listening_time() {
        return this.notification_listening_time;
    }
    /**
     * Get the start time of the file streamer.
     * @returns {number} - The start time of the file streamer.
     * @memberof DecentralizedFileStreamer
     */
    get_file_streamer_start_time() {
        return this.file_streamer_start_time;
    }
    /**
     * Get the session with the credentials.
     * @param {session_credentials} credentials - The credentials of the solid pod for which you can generate an authenticated session to communicated to the Solid Pod's LDP.
     * @returns {Promise<Session>} - The authenticated session.
     * @memberof DecentralizedFileStreamer
     */
    async get_session(credentials: session_credentials): Promise<Session> {
        return await session_with_credentials(credentials);
    }
    /**
     * Send a message to Heimdall's WebSocket server.
     * @static
     * @param {string} message - The message to send to the server (which in this case is the generated aggregation event).
     * @memberof DecentralizedFileStreamer
     */
    static sendToServer(message: string) {
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
     * Connect with Heimdall's WebSocket server.
     * @static
     * @param {string} wssURL - The URL of the websocket server.
     * @memberof DecentralizedFileStreamer
     */
    static async connect_with_server(wssURL: string) {
        this.client.connect(wssURL, HEIMDALL_WEBSOCKET_PROTOCOL);
        this.client.on('connect', (connection: typeof websocketConnection) => {
            DecentralizedFileStreamer.connection = connection;
        });
        this.client.setMaxListeners(Infinity);
        this.client.on('connectFailed', (error: Error) => {
            console.log('Connect Error: ' + error.toString());
        });
    }

}

type session_credentials = {
    id: string;
    secret: string;
    idp: string;
}
