/* eslint-disable no-unused-vars */
declare module 'rsp-js' {
    import { EventEmitter } from 'events';

    export type RDFStream = {
        add: (...args: [unknown, number, string?]) => void;
    };

    /**
     *
     */
    export class RSPEngine {
        /**
         *
         */
        constructor(...args: [string, any?]);
        /**
         *
         */
        register(): EventEmitter;
        /**
         *
         */
        getStream(...args: [string]): RDFStream | undefined;
    }
}
