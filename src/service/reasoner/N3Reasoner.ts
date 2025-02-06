import { storeToString } from "@treecg/ldes-snapshot";
import { n3reasoner, runQuery, SwiplEye } from "eyereasoner";
const N3 = require('n3');

export class N3ReasonerService {

    public n3_rules: string
    constructor(rules: string) {
        this.n3_rules = rules;
    }

    public get rules(): string {
        return this.n3_rules
    }

    public set rules(rules: string) {
        this.n3_rules = rules;
    }

    public async reason(data: string): Promise<string> {
        let n3_parser = new N3.Parser({
            format: 'text/n3',
        });

        const store = new N3.Store();
        let rules = n3_parser.parse(this.n3_rules);        
        let data_parsed = n3_parser.parse(data);

        for (let elem of rules) {
            store.addQuad(elem);
        }

        for (let elem of data_parsed) {
            store.addQuad(elem);
        }
        

        const inferredStore = new N3.Store(await n3reasoner(store.getQuads(), undefined, {
            output: 'derivations',
            outputType: 'quads',
        }));


        return storeToString(inferredStore);
    }

}