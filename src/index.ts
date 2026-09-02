import { HTTPServer } from "./server/HTTPServer";
import * as bunyan from 'bunyan';
import * as fs from 'fs';
import * as path from 'path';
import { createRuntimeResources } from './evaluation/Runtime';

/**
 * Build a filesystem-safe timestamp string for runtime log filenames.
 * @returns {string} The current local timestamp.
 */
function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
}

const timestamp = getTimestamp();
const resultsDir = path.resolve(process.env.HEIMDALL_RESULTS_DIR || '.');
fs.mkdirSync(resultsDir, { recursive: true });
const log_file = fs.createWriteStream(path.join(resultsDir, process.env.HEIMDALL_RESULTS_DIR ? 'heimdall.log' : `heimdall-${timestamp}.log`), { flags: 'a' });
const logger = bunyan.createLogger({
    name: 'heimdall',
    streams: [
        {
            level: 'info',
            stream: log_file
        },
    ],
    serializers: {
        log: (log_data: any) => {
            return {
                ...log_data,
                query_id: log_data.query_id || 'no_query_id',
            }
        }
    }
});

const runtime = createRuntimeResources(logger);

const program = require('commander');

program
    .version('0.0.1')
    .description('Heimdall, a Solid Stream Analytics Service.')
    .name('heimdall')

program
    .command('aggregation')
    .description('Starting the aggregation service.')
    .option(
        '-p, --port <port>',
        'The port of the REST HTTP server',
        '8080'
    )
    .option(
        '-ss --solid_server_url <SolidServer>',
        'The URL of the Solid Pod server where the LDES streams are stored in a Solid Pod',
        'http://localhost:3000/'
    )
    .action(async (options: any) => {
        const server = new HTTPServer(options.port, options.SolidServer, logger, runtime.writer);
        let shuttingDown = false;
        const shutdown = async () => {
            if (shuttingDown) return;
            shuttingDown = true;
            await server.close();
            await runtime.close();
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
    });

program.parse();
