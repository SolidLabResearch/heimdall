import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetricWriter } from '../evaluation/MetricWriter';

describe('HTTPServer', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
        ok: true,
        json: async () => ({}),
        text: async () => '',
    }) as Response);

    afterAll(() => fetchSpy.mockRestore());

    it('initializes without constructing a local aggregation-pod publisher', async () => {
        const logger = { info: jest.fn(), debug: jest.fn() };
        const server = new (require('./HTTPServer').HTTPServer)(0, 'http://localhost:3000/', logger);

        expect(server.websocket_handler.aggregation_publisher).toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();
        await server.close();
    });

    it('shares the supplied metric writer with its query registry', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heimdall-http-server-'));
        const previousResultsDir = process.env.HEIMDALL_RESULTS_DIR;
        process.env.HEIMDALL_RESULTS_DIR = directory;
        const logger = { info: jest.fn(), debug: jest.fn() };
        const runtimeWriter = new MetricWriter();
        let server: any;

        try {
            expect(() => {
                server = new (require('./HTTPServer').HTTPServer)(0, 'http://localhost:3000/', logger, runtimeWriter);
            }).not.toThrow('Refusing to overwrite evaluation output');
            await server.close();
        } finally {
            if (previousResultsDir === undefined) delete process.env.HEIMDALL_RESULTS_DIR;
            else process.env.HEIMDALL_RESULTS_DIR = previousResultsDir;
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
