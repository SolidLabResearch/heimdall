import { GETHandler } from './GETHandler';

describe('GETHandler', () => {
    it('keeps the GET handler test suite active', () => {
        expect(true).toBe(true);
    });

    it('reports ready through /health', async () => {
        const response = { writeHead: jest.fn(), write: jest.fn() } as any;
        await GETHandler.handle({ url: '/health' } as any, response, {} as any);
        expect(response.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
        expect(response.write).toHaveBeenCalledWith('{"status":"ok"}');
    });
});
