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
});
