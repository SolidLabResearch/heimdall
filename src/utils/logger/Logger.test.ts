import { Logger } from "./Logger";
import { LogLevel } from "./LoggerEnums";
describe('Logger', () => {
    it('should initialize', () => {
        const logLevel: LogLevel = LogLevel.INFO;
        const loggableClasses = ['RSPService'];
        const logDestination_console = 'CONSOLE';
        const logDestination_file = 'FILE';
        const logger_console = new Logger(
            logLevel,
            loggableClasses,
            logDestination_console,
        );
        expect(logger_console).toBeDefined();

        const logger_file = new Logger(
            logLevel,
            loggableClasses,
            logDestination_file,
        );

        expect(logger_file).toBeDefined();
    });
});