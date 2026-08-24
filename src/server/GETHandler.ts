import { IncomingMessage, ServerResponse } from "http";
import fs from 'fs';
import { QueryRegistry } from "../service/query-registry/QueryRegistry";
/**
 * Class for handling the GET request from the client.
 * @class GETHandler
 */
export class GETHandler {
    /**
     * Handle the GET request from the client.
     * @static
     * @param {IncomingMessage} req - The request from the client.
     * @param {ServerResponse} res - The response to the client.
     * @param {QueryRegistry} query_registry - The QueryRegistry object.
     * @memberof GETHandler
     */
    public static async handle(req: IncomingMessage, res: ServerResponse, query_registry: QueryRegistry) {
        if (req.url !== undefined) {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify({ status: 'ok' }));
                return;
            }
            /**
             * The following API path of Heimdall is used to clear all registered queries from the query registry.
             */
            if (req.url === '/clearQueryRegistry') {
                query_registry.delete_all_queries_from_the_registry();
                res.write('Query registry cleared');
            }
        }
        else {
            const endpoint = req.url;
            console.log('Endpoint: ' + endpoint);
            /**
             * The API path showcases a default HTML page for Heimdall.
             */
            const file = fs.readFileSync('dist/static/index.html');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.write(file.toString());
        }

    }

}
