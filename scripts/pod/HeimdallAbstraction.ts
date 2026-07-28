import { storeToString } from "@treecg/versionawareldesinldp";
const N3 = require('n3');
/**
 * Class for adding Heimdall to the solid pod's profile card.
 * @class HeimdallAbstraction
 */
export class HeimdallAbstraction {
    /**
     *  
     * A map of the solid pod URLs with the location of Heimdall.
     * @type {Map<string, string>}
     * @memberof HeimdallAbstraction
     */
    pod_heimdall_location: Map<string, string>;
    /**
     * Creates an instance of HeimdallAbstraction.
     * @param {Map<string, string>} heimdall_map - A map of the solid pod URLs with the location of Heimdall.
     * @memberof HeimdallAbstraction
     */
    constructor(heimdall_map: Map<string, string>) {
        this.pod_heimdall_location = heimdall_map;
    }
    /**
     * Adds Heimdall to the solid pod card.
     * @memberof HeimdallAbstraction
     */
    public add_heimdall_to_pod_card() {
        this.pod_heimdall_location.forEach((pod_location: string, heimdall_location: string) => {
            this.patch_request(pod_location, heimdall_location);
        });
    }
    /**
     * Patches the solid pod with Heimdall's location.
     * @param {string} solid_pod_url - The URL of the solid pod.
     * @param {string} heimdall_location - The location of Heimdall.
     * @memberof HeimdallAbstraction
     */
    public patch_request(solid_pod_url: string, heimdall_location: string) {
        const store = new N3.Store();
        store.addQuad(
            N3.DataFactory.namedNode(solid_pod_url + '/profile/card#me'),
            N3.DataFactory.namedNode('http://w3id.org/rsp/vocals-sd#hasFeature'),
            N3.DataFactory.namedNode('http://w3id.org/rsp/vocals-sd#ProcessingService')
        );
        store.addQuad(
            N3.DataFactory.namedNode('http://w3id.org/rsp/vocals-sd#ProcessingService'),
            N3.DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            N3.DataFactory.namedNode('http://argahsuknesib.github.io/asdo/StreamAggregationService')
        );
        store.addQuad(
            N3.DataFactory.namedNode('http://argahsuknesib.github.io/asdo/StreamAggregationService'),
            N3.DataFactory.namedNode('http://xmlns.com/foaf/0.1/webId'),
            N3.DataFactory.namedNode(heimdall_location + '/#this')
        );
        fetch(solid_pod_url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/sparql-update'
            },
            body: "INSERT DATA {" + storeToString(store) + "}",
        });
    }
}
