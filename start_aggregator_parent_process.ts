import { fork, ChildProcess } from 'child_process';


export function startAggregatorProcess() {
    const aggregator_process: ChildProcess = fork('./dist/index.js', ['aggregation']);
    aggregator_process.on('message', (message: string) => {
        console.log(`Message received from aggregator process : ${message}`);
    });

    aggregator_process.on('exit', (code: number, signal: string) => {
        console.log(`Aggregator process exited with code ${code} and signal ${signal}`);
    });
}

startAggregatorProcess();