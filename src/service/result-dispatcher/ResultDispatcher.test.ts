import { ResultDispatcher } from "./ResultDispatcher";
describe('ResultDispatcherClass', () => {
    let result_dispatcher: ResultDispatcher;
    let websocket_client: any;
    beforeEach(() => {
        result_dispatcher = new ResultDispatcher();
        websocket_client = {
            send: jest.fn(),
        };
    });
    it('check_the_query_socket_channels', () => {
        expect(result_dispatcher.query_socket_channels).toBeInstanceOf(Map);
    });
    it('get_the_assigned_channel_to_query', () => {
        result_dispatcher.assign_channel_to_query('query_id', websocket_client);
        expect(result_dispatcher.query_socket_channels.get('query_id')).toEqual(websocket_client);
    });

    it('send_the_result_to_query_channel', () => {
        result_dispatcher.assign_channel_to_query('query_id', websocket_client);
        const result = `<http://example.org/subject1> <http://example.org/predicate1> <http://example.org/object1> .`;
        expect(result_dispatcher.send_result_to_query_channel('query_id', result)).toBe(true);
        expect(websocket_client.send).toHaveBeenCalledWith(JSON.stringify(result));
    });
});
