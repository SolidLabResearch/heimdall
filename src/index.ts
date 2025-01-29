import { HTTPServer } from "./server/HTTPServer";
import * as bunyan from 'bunyan';
import * as fs from 'fs';

function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
}

const timestamp = getTimestamp();

const log_file = fs.createWriteStream(`aggregator-${timestamp}.log`, { flags: 'a' });
const resource_used_log_file = `aggregator_resource_used-${timestamp}.csv`;
const logger = bunyan.createLogger({
    name: 'solid-stream-aggregator',
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

interface MemoryUsage {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
}

fs.writeFileSync(resource_used_log_file, `timestamp, cpu_user, cpu_system, rss, heapTotal, heapUsed, external\n`);


function logCpuMemoryUsage() {
    const cpuUsage = process.cpuUsage(); // in microseconds
    const memoryUsage: MemoryUsage = process.memoryUsage(); // in bytes
    const timestamp = Date.now();
    const logData = `${timestamp},${cpuUsage.user},${memoryUsage.rss},${memoryUsage.heapTotal},${memoryUsage.heapUsed},${memoryUsage.external}\n`;
    fs.appendFileSync(resource_used_log_file, logData);
}

setInterval(logCpuMemoryUsage, 500);

const program = require('commander');

program
    .version('0.0.1')
    .description('Aggregating LDES streams from a Solid Pod.')
    .name('solid-stream-aggregator')

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
        new HTTPServer(options.port, options.SolidServer, logger);
    });

program.parse();
