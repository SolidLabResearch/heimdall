import { EventEmitter } from 'events';

export type RDFStream = {
        add: jest.Mock;
};

/**
 * Minimal Jest-time stub for the local `rsp-js` dependency.
 */
export class RSPEngine {
    private readonly emitter = new EventEmitter();
    private readonly onMetric?: (event: string, metric: any) => void;

    /**
     * Construct the stub engine.
     * @param {string} query - The registered query string.
     */
    public readonly metrics = new EventEmitter();

    constructor(query: string, options?: any) {
        void query;
        this.onMetric = options?.onMetric;
    }

    /**
     * Return a reusable event emitter for test registrations.
     * @returns {EventEmitter} The stub event emitter.
     */
    register(): EventEmitter {
        return this.emitter;
    }

    /**
     * Return a mock RDF stream for a named stream binding.
     * @param {string} name - The requested stream name.
     * @returns {RDFStream} The stub RDF stream.
     */
    getStream(name: string): RDFStream {
        void name;
        return {
            add: jest.fn(),
        };
    }

    emitMetric(event: string, metric: any): void {
        this.onMetric?.(event, metric);
    }
}
