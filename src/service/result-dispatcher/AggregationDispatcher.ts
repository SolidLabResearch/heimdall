import { RSPQLParser } from "../parsers/RSPQLParser";
const parser: RSPQLParser = new RSPQLParser();
import * as HEIMDALL_CONFIG from '../../config/heimdall_config.json';
import { RateLimitedLDPCommunication } from "rate-limited-ldp-communication";
import { filterRelation, ILDESinLDPMetadata, LDESinLDP, MetadataParser } from "@treecg/versionawareldesinldp";
const ld_fetch = require('ldfetch');
const ldfetch = new ld_fetch({});
import { extractDateFromLiteral } from "@treecg/versionawareldesinldp";
import { Member } from "@treecg/types";
import { Readable } from "stream";
import { Quad } from "rdflib/lib/tf-types";
import { hash_string_md5 } from "../../utils/Util";
import { TREE } from "@treecg/ldes-snapshot";
import { DataFactory, Store } from "n3";
import { aggregationDispatcherType } from "../../utils/Types";
import { Literal } from "n3";
import { resolveHeimdallRuntimeConfig } from "../../config/heimdallConfig";
const { namedNode } = DataFactory;

/**
 * Class for dispatching aggregated events.
 * @class AggregationDispatcher
 */
export class AggregationDispatcher {
    public query: string;
    public communication: RateLimitedLDPCommunication;
    public aggregation_ldes: LDESinLDP;

    /**
     * Creates an instance of AggregationDispatcher.
     * @param {string} query - The query to be dispatched.
     * @memberof AggregationDispatcher
     */
    public constructor(query: string) {
        const heimdallConfig = resolveHeimdallRuntimeConfig(HEIMDALL_CONFIG);
        this.query = query;
        this.communication = new RateLimitedLDPCommunication(heimdallConfig.heimdallRateLimit);
        this.aggregation_ldes = new LDESinLDP(heimdallConfig.aggregationPodLdesLocation, this.communication)
    }

    /**
     * Dispatches aggregated events.
     * @param {aggregationDispatcherType} opts - The options for reading the aggregated events.
     * @param {Date} opts.from - The start date of the events to be dispatched.
     * @param {Date} opts.to - The end date of the events to be dispatched. 
     * @returns {Promise<Readable>} - A promise that resolves to a readable stream of aggregated events.
     * @memberof AggregationDispatcher 
     */
    public async dispatch_aggregated_events(opts: {
        from?: Date;
        to?: Date;
    }): Promise<Readable> {

        let { from, to } = opts ?? {};
        from = opts.from ?? new Date(0);
        to = opts.to ?? new Date();

        const member_stream = new Readable({
            objectMode: true,
            read() { }
        });

        const metadata = await extractLdesMetadata(this.aggregation_ldes);
        const relations = filterRelation(metadata, from, to);


        for (const relation of relations) {
            const resources = this.aggregation_ldes.readPage(relation.node);
            const members: Member[] = [];

            for await (const resource of resources) {
                const member_identifier = resource.getSubjects(relation.path, null, null)[0].value;
                resource.removeQuads(resource.getQuads(metadata.eventStreamIdentifier, TREE.member, null, null));
                const member: Member = {
                    id: namedNode(member_identifier),
                    quads: resource.getQuads(null, null, null, null)
                }

                const member_date_time = extractDateFromMember(member, relation.path);
                if (from <= member_date_time && member_date_time <= to) {
                    members.push({
                        id: namedNode(member_identifier),
                        quads: resource.getQuads(null, null, null, null)
                    });
                }

                const sorted_members = members.sort((a: Member, b: Member) => {
                    const a_date = extractDateFromMember(a, relation.path);
                    const b_date = extractDateFromMember(b, relation.path);
                    return a_date.getTime() - b_date.getTime();
                });

                for (const member of sorted_members) {
                    member_stream.push(member);
                }

                member_stream.push(null);
            }
        }
        return Promise.resolve(member_stream);
    }

    /**
     * Checks if aggregated events exist.
     * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating if aggregated events exist.
     * @memberof AggregationDispatcher
     */
    public async if_aggregated_events_exist(): Promise<boolean> {
        // TODO : add the feature for query isomorphism here.
        // by creating a mapping between the query and the query hash(es).
        // Relevant Issue : https://github.com/SolidLabResearch/solid-stream-aggregator/issues/36
        let aggregated_events_exist: boolean = false;
        const parsed_query = parser.parse(this.query);
        const query_streams: string[] = [];
        for (const stream of parsed_query.s2r) {
            query_streams.push(stream.stream_name);
        }
        const fragment_containers: string[] = [];
        const metadata = await this.aggregation_ldes.readMetadata();
        for (const quad of metadata) {
            if (quad.predicate.value === "http://www.w3.org/ns/ldp#contains") {
                fragment_containers.push(quad.object.value);
            }
        }

        const fno_description = new Map<string, Quad[]>()
        for (const fragment of fragment_containers) {
            const fno_metadata = fragment + '.meta'
            const response = await ldfetch.get(fno_metadata);
            fno_description.set(fragment, response.triples);
        }

        fno_description.forEach((value) => {
            const quads = value;
            for (const quad of quads) {
                if (quad.predicate.value === "http://www.example.org/has_query_hash") {
                    if (hash_string_md5(this.query) === quad.object.value) {
                        aggregated_events_exist = true;
                    }
                    else {
                        aggregated_events_exist = false;
                    }
                }
            }
        });
        return aggregated_events_exist;
    }
}

/**
 * Extracts the metadata of an LDES in LDP.
 * @param {LDESinLDP} ldes_in_ldp - The LDES in LDP object.
 * @returns {Promise<ILDESinLDPMetadata>} - The metadata of the LDES in LDP.
 */
export async function extractLdesMetadata(ldes_in_ldp: LDESinLDP): Promise<ILDESinLDPMetadata> {
    const metadata_store = await ldes_in_ldp.readMetadata();
    return MetadataParser.extractLDESinLDPMetadata(metadata_store, ldes_in_ldp.eventStreamIdentifier);
}

/**
 * Extracts the date from a member using the path.
 * @param {Member} member - The member to extract the date from.
 * @param {string} path - The TREE path used to fragment the LDES and therefore the path to extract the date.
 * @returns {Date} - The date of the member.
 */
export function extractDateFromMember(member: Member, path: string): Date {
    const store = new Store(member.quads);
    // member date
    const dateLiteral = store.getObjects(member.id, path, null)[0] as Literal;
    const memberDateTime = extractDateFromLiteral(dateLiteral);
    return memberDateTime
}
