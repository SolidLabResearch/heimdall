import { Parser, Writer, Store } from 'n3';
import { randomUUID } from 'crypto';

const parser = new Parser();

export async function accessResource(podOwnerWebID: string, resourceToAccessURL: string, requestingAgentID: string, policyConditions: string, policy_container: string) {
    const terms = {
        solid: {
            umaServer: 'http://www.w3.org/ns/solid/terms#umaServer',
            viewIndex: 'http://www.w3.org/ns/solid/terms#viewIndex',
            entry: 'http://www.w3.org/ns/solid/terms#entry',
            filter: 'http://www.w3.org/ns/solid/terms#filter',
            location: 'http://www.w3.org/ns/solid/terms#location',
        },
        filters: {
            bday: 'http://localhost:3000/catalog/public/filters/bday',
            age: 'http://localhost:3000/catalog/public/filters/age',
        },
        views: {
            bday: 'http://localhost:3000/ruben/private/derived/bday',
            age: 'http://localhost:3000/ruben/private/derived/age',
        },
        resources: {
            smartwatch: 'http://localhost:3000/ruben/medical/aggregation-x/'
        },
        agents: {
            ruben: 'http://localhost:3000/ruben/profile/card#me',
            alice: 'http://localhost:3000/alice/profile/card#me',
            vendor: 'http://localhost:3000/demo/public/vendor',
            present: 'http://localhost:3000/demo/public/bday-app',
        },
        scopes: {
            read: 'urn:example:css:modes:read',
        }
    }
    const webIdData = new Store(parser.parse(await (await fetch(podOwnerWebID)).text()));
    const umaServer = webIdData.getObjects(podOwnerWebID, "http://www.w3.org/ns/solid/terms#umaServer", null)[0].value;
    const configURL = new URL(".well-known/uma2-configuration", umaServer);
    const umaConfig = await (await fetch(configURL)).json();
    const tokenEndpoint = umaConfig.token_endpoint;
    //console.log(`The UMA server is located at ${umaServer} with token endpoint at ${tokenEndpoint}`);


    const policy_creation_response = await fetch(policy_container, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/turtle'
        },
        body: policyConditions
    });

    if (policy_creation_response.status !== 201) {
        console.error(`Error creating policy: ${policy_creation_response.statusText}`);
    }

    //console.log(`Policy created at ${policy_container}`);

    const response = await fetch(resourceToAccessURL, {
        method: 'GET',
        headers: {
            'Accept': 'application/json '
        }
    });

    const umaHeader = await response.headers.get('WWW-authenticate');

    //console.log(`First, a resource request is done without authorization that results in a 403 response and accompanying UMA ticket in the WWW-Authenticate header according to the UMA specification:${umaHeader}`);

    let ticket = umaHeader?.split('ticket="')[1].split('"')[0];

    const accessRequestNoClaimsODRL = {
        "@context": "https://www.w3.org/ns/odrl.jsonld",
        "@type": "Request",
        profile: { "@id": "https://w3id.org/oac#" },
        uid: `http://example.org/aggregator-request/${randomUUID()}`,
        description: `Aggregator requests access to the resource ${resourceToAccessURL}`,
        permission: [{
            "@type": "Permission",
            "uid": `http://example.org/aggregator-request-permission/${randomUUID()}`,
            assigner: `${podOwnerWebID}`,
            assignee: `${requestingAgentID}`,
            action: { "@id": "https://w3id.org/oac#read" },
            target: resourceToAccessURL,
        }],
        grant_type: "urn:ietf:params:oauth:grant-type:uma-ticket",
        ticket,
    };

    const needInfoResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(accessRequestNoClaimsODRL)
    });

    // //console.log(await needInfoResponse.text());

    // if (await needInfoResponse.status === 403) {
    //     //console.log(`The request is denied, and the server asks for additional claims.`);
    // }
    // else {
    //     //console.log(`The request is granted without additional claims.`);
    // }

    // //console.log(await needInfoResponse.text());


    const { ticket: ticket2, required_claims: aggregator_claims } = await needInfoResponse.json();
    ticket = ticket2;
    //console.log(`Based on the policy set above, the Authorization Server requests the following claims from the doctor:`);
    // aggregator_claims.claim_token_format[0].forEach((format: string) => console.log(`  - ${format}`))
    //console.log(`accompanied by an updated ticket: ${ticket}`);

    //console.log(aggregator_claims);

    const claim_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vd3d3LnczLm9yZy9ucy9vZHJsLzIvcHVycG9zZSI6Imh0dHA6Ly9leGFtcGxlLm9yZy9hZ2dyZWdhdGlvbiIsInVybjpzb2xpZGxhYjp1bWE6Y2xhaW1zOnR5cGVzOndlYmlkIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwL2FsaWNlL3Byb2ZpbGUvY2FyZCNtZSIsImh0dHBzOi8vdzNpZC5vcmcvb2FjI0xlZ2FsQmFzaXMiOiJodHRwczovL3czaWQub3JnL2Rwdi9sZWdhbC9ldS9nZHByI0E5LTItYSJ9.uK8nGcsVxT-KXvrNkSxbVdsNoSeEE-NZXszSumcRH1k"
    // const claim_token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

    const claims: any = {
        "http://www.w3.org/ns/odrl/2/purpose": "http://example.org/aggregation",
        "http://www.w3.org/ns/odrl/2/legalBasis": "https://w3id.org/dpv/legal/eu/gdpr#A9-2-a",
        "urn:solidlab:uma:claims:types:webid": requestingAgentID
    }

    const claim_access_request = {
        "@context": "https://www.w3.org/ns/odrl.jsonld",
        "@type": "Request",
        profile: { "@id": "https://w3id.org/oac#" },
        uid: `http://example.org/aggregator-request/${randomUUID()}`,
        description: `Aggregator requests access to the resource ${resourceToAccessURL} for aggregation purposes`,
        permission: [
            {
                "@type": "Permission",
                "@id": `http://example.org/aggregator-request-permission/${randomUUID()}`,
                target: resourceToAccessURL,
                action: { "@id": "https://w3id.org/oac#read" },
                assigner: podOwnerWebID,
                assignee: requestingAgentID,
                constraint: [
                    {
                        "@type": "Constraint",
                        "@id": "http://example.org/aggregator-request-permission-purpose/${randomUUID()}",
                        leftOperand: "purpose",
                        operator: "eq",
                        rightOperand: { "@id": "http://example.org/aggregation" },
                    }, {
                        "@type": "Constraint",
                        "@id": `http://example.org/aggregator-request-permission/${randomUUID()}`,
                        leftOperand: { "@id": "https://w3id.org/oac#LegalBasis" },
                        operator: "eq",
                        rightOperand: { "@id": "https://w3id.org/dpv/legal/eu/gdpr#A9-2-a" },
                    }
                ]
            }
        ],
        claim_token: claim_token,
        claim_token_format: "urn:solidlab:uma:claims:formats:jwt",
        grant_type: "urn:ietf:params:oauth:grant-type:uma-ticket",
        ticket,
    }

    //console.log(`${JSON.stringify(claim_access_request, null, 2)}`);

    const accessGrantedResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(claim_access_request)
    });

    // //console.log(accessGrantedResponse);


    // //console.log(`The request is granted with the following response: ${await accessGrantedResponse.text()}`);


    const param_access_token = "eyJhbGciOiJFUzI1NiJ9.eyJwZXJtaXNzaW9ucyI6W3sicmVzb3VyY2VfaWQiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAvcnViZW4vbWVkaWNhbC9zbWFydHdhdGNoLnR0bCIsInJlc291cmNlX3Njb3BlcyI6WyJ1cm46ZXhhbXBsZTpjc3M6bW9kZXM6cmVhZCJdfV0sImNvbnRyYWN0Ijp7IkBjb250ZXh0IjoiaHR0cDovL3d3dy53My5vcmcvbnMvb2RybC5qc29ubGQiLCJAdHlwZSI6IkFncmVlbWVudCIsInVpZCI6InVybjp1bWE6cGFjc29pOmFncmVlbWVudDo3Mzg2NDlhMi1mODk4LTQ1YzItOWEwNi05ODAyMTJjMTMyODUiLCJodHRwOi8vcHVybC5vcmcvZGMvdGVybXMvZGVzY3JpcHRpb24iOiJBZ3JlZW1lbnQgZm9yIEhDUCBYIHRvIHJlYWQgQWxpY2UncyBoZWFsdGggZGF0YSBmb3IgYmFyaWF0cmljIGNhcmUuIiwiaHR0cHM6Ly93M2lkLm9yZy9kcHYjaGFzTGVnYWxCYXNpcyI6eyJAaWQiOiJodHRwczovL3czaWQub3JnL2Rwdi9sZWdhbC9ldS9nZHByI2V1LWdkcHI6QTktMi1hIn0sInBlcm1pc3Npb24iOlt7IkB0eXBlIjoiUGVybWlzc2lvbiIsImFjdGlvbiI6Imh0dHBzOi8vdzNpZC5vcmcvb2FjI3JlYWQiLCJ0YXJnZXQiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAvcnViZW4vbWVkaWNhbC9zbWFydHdhdGNoLnR0bCIsImFzc2lnbmVyIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwL3J1YmVuL3Byb2ZpbGUvY2FyZCNtZSIsImFzc2lnbmVlIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwL2FsaWNlL3Byb2ZpbGUvY2FyZCNtZSIsImNvbnN0cmFpbnQiOlt7IkB0eXBlIjoiQ29uc3RyYWludCIsImxlZnRPcGVyYW5kIjoicHVycG9zZSIsIm9wZXJhdG9yIjoiZXEiLCJyaWdodE9wZXJhbmQiOnsiQGlkIjoiaHR0cDovL2V4YW1wbGUub3JnL2JhcmlhdHJpYy1jYXJlIn19XX1dfSwiaWF0IjoxNzM3OTg4NDgxLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjQwMDAvdW1hIiwiYXVkIjoic29saWQiLCJleHAiOjE3Mzc5ODg3ODEsImp0aSI6ImI0MjMxYTg2LTM1ODEtNDc3OS1iMjY2LWUwNTFkMDg3ZjgyNiJ9.54RgDPgx2RNQ-GyUy8XeJJUI04foC-3YQ8qu_Oqx0VdiEEipMRopoWeLl8gxaoZkTi_NBUPFh3VAlW9nld8R6w"

    // //console.log(`The request is granted with the following response: ${await accessGrantedResponse.text()}`);

    const token_params = await accessGrantedResponse.json();

    //console.log(`Token Parameter Access Token is: `, token_params.access_token);

    if (token_params.access_token) {
        return true;
    }
    else {
        return false;
    }
}

function parseJwt(token: string) {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

const healthcare_patient_policy_agg =
    `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX eu-gdpr: <https://w3id.org/dpv/legal/eu/gdpr#>
PREFIX oac: <https://w3id.org/oac#>
PREFIX odrl: <http://www.w3.org/ns/odrl/2/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

PREFIX ex: <http://example.org/>

<http://example.org/aggregator-request> a odrl:Request ;
    odrl:uid ex:aggregator-request ;
    odrl:profile oac: ;
    dcterms:description "Aggregator requests to read patient's accelerometer data for aggregation purposes" ;
    odrl:permission <http://example.org/aggregator-request-permission> .

<http://example.org/aggregator-request-permission> a odrl:Permission ;
    odrl:action odrl:read ;
    odrl:target <http://localhost:3000/pod1/acc-x/> ;
    odrl:assigner <http://localhost:3000/pod1/profile/card#me> ;
    odrl:assignee <http://localhost:3000/aggregator/profile/card#me> ;
    odrl:constraint <http://example.org/aggregator-request-permission-purpose>,
        <http://example.org/aggregator-request-permission-lb> .

<http://example.org/aggregator-request-permission-purpose> a odrl:Constraint ;
    odrl:leftOperand odrl:purpose ; # can also be oac:Purpose, to conform with OAC profile
    odrl:operator odrl:eq ;
    odrl:rightOperand ex:aggregation .

<http://example.org/aggregator-request-permission-lb> a odrl:Constraint ;
    odrl:leftOperand oac:LegalBasis ;
    odrl:operator odrl:eq ;
    odrl:rightOperand eu-gdpr:A9-2-a .`


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
  odrl:rightOperand eu-gdpr:A9-2-a .`


async function main() {
    console.log(await accessResource('http://localhost:3000/ruben/profile/card#me', 'http://localhost:3000/ruben/medical/aggregation-x/', 'http://localhost:3000/alice/profile/card#me', healthcare_patient_policy, 'http://localhost:3000/ruben/settings/policies/'));
}

main();
