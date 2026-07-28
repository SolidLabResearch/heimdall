import { fork, ChildProcess } from 'child_process';


/**
 * Start the Heimdall parent process used by the runtime launcher.
 * @returns {void}
 */
export function startHeimdallProcess() {
    const heimdall_process: ChildProcess = fork('./dist/index.js', ['aggregation']);
    heimdall_process.on('message', (message: string) => {
        console.log(`Message received from Heimdall process: ${message}`);
    });

    heimdall_process.on('exit', (code: number, signal: string) => {
        console.log(`Heimdall process exited with code ${code} and signal ${signal}`);
    });
}

startHeimdallProcess();
