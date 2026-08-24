import { Logger } from "tslog";
import { QueryRegistry } from "./QueryRegistry";
import { MetricWriter } from '../../evaluation/MetricWriter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('QueryRegistry', () => {
    let query_registry: QueryRegistry;
    beforeAll(() => {
        query_registry = new QueryRegistry();
    })
    const logger = new Logger();
    const rspql_query = `
    PREFIX saref: <https://saref.etsi.org/core/>
    PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
    PREFIX : <https://rsp.js/>
    REGISTER RStream <output> AS
    SELECT (MAX(?o) as ?maxSKT)
    FROM NAMED WINDOW :w1 ON STREAM <http://n061-14a.wall2.ilabt.iminds.be:3000/participant6/skt/> [RANGE 180000 STEP 30000]
    WHERE {
        WINDOW :w1 {
            ?s saref:hasValue ?o .
            ?s saref:relatesToProperty dahccsensors:wearable.skt .
        }   
    }
`;

    it('initializing the QueryRegistry', () => {
        expect(query_registry).toBeInstanceOf(QueryRegistry);
    });
    it(`adding a query to the registry`, async () => {
        expect(await query_registry.add_query_in_registry(rspql_query, logger)).toBe(true);
        query_registry.delete_all_queries_from_the_registry();
    });

    it('delete_all_queries_from_the_registry', async () => {
        const query_one = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (MAX(?o) as ?maxSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14a.wall2.ilabt.iminds.be:3000/participant6/skt/> [RANGE 180000 STEP 30000]
        WHERE {
            WINDOW :w1 {
                ?s saref:hasValue ?o .
                ?s saref:relatesToProperty dahccsensors:wearable.skt .
            }   
        }
        `;

        const query_two = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (MIN(?o) as ?minSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14a.wall2.ilabt.iminds.be:3000/participant6/skt/> [RANGE 180000 STEP 30000]
        WHERE {
            WINDOW :w1 {
                ?s saref:relatesToProperty ?o .
            }   
        }
        `;
        await query_registry.add_query_in_registry(query_one, logger);
        await query_registry.add_query_in_registry(query_two, logger);
        expect(query_registry.get_registered_queries().get_length()).toBe(2);
        query_registry.delete_all_queries_from_the_registry();
        expect(query_registry.get_registered_queries().get_length()).toBe(0);
    });

    it('if_only_unique_queries_are_added_to_query_registry', async () => {
        console.log(query_registry.get_executing_queries());
        const query_one = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (AVG(?o) as ?avgSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14/skt/> [RANGE 800 STEP 100]
        WHERE {
            WINDOW :w1{
                ?s saref:hasValue ?o
            }
        }
        `;

        const query_two = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (AVG(?o) as ?avgSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14/skt/> [RANGE 800 STEP 100]
        WHERE {
            WINDOW :w1{
                ?s saref:hasValue ?o
            }
        }
        `;

        const query_three = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (AVG(?o) as ?avgSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14/skt/> [RANGE 800 STEP 100]
        WHERE {
            WINDOW :w1{
                ?s ?p ?o
            }
        }
        `;
        // The first query is unique and should be added to the registry.
        // The second query is not unique and should not be added to the registry.
        expect(await query_registry.add_query_in_registry(query_one, logger)).toBe(true);
        expect(await query_registry.add_query_in_registry(query_two, logger)).toBe(false);
        // The third query is unique and should be added to the registry.
        expect(await query_registry.add_query_in_registry(query_three, logger)).toBe(true);
        query_registry.delete_all_queries_from_the_registry();
        expect(query_registry.get_registered_queries().get_length()).toBe(0);
    });

    it('get_registered_queries', async () => {
        const query_one = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (AVG(?o) as ?avgSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14/skt/> [RANGE 800 STEP 100]
        WHERE {
            WINDOW :w1{
                ?s saref:hasValue ?o
            }
        }
        `;

        await query_registry.add_query_in_registry(query_one, logger);
        expect(query_registry.get_registered_queries().getArrayCopy().length).toBe(1);
    });

    it('check_unique_query', async () => {
        const query_one = `
        PREFIX saref: <https://saref.etsi.org/core/>
        PREFIX dahccsensors: <https://dahcc.idlab.ugent.be/Homelab/SensorsAndActuators/>
        PREFIX : <https://rsp.js/>
        REGISTER RStream <output> AS
        SELECT (AVG(?o) as ?avgSKT)
        FROM NAMED WINDOW :w1 ON STREAM <http://n061-14/skt/> [RANGE 800 STEP 100]
        WHERE {
            WINDOW :w1{
                ?s saref:hasValue ?o
            }
        }
        `;
        await query_registry.add_query_in_registry(query_one, logger);        
        expect(query_registry.checkUniqueQuery(query_one, logger)).toBe(true);
    });

    it('records the actual registration and reuse-check operations', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-registry-'));
        const registry = new QueryRegistry(new MetricWriter(directory, 'run-registry', 'heimdall'));
        await registry.add_query_in_registry(rspql_query, logger);
        const metrics = fs.readFileSync(path.join(directory, 'initialization.csv'), 'utf8');
        expect(metrics).toContain('query_registration');
        expect(metrics).toContain('query_reuse_check');
    });
});
