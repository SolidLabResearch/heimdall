import { SourcePodAccess } from './SourcePodAccess';

describe('SourcePodAccess', () => {
    it('uses ordinary fetch without source credentials for a public stream', async () => {
        const access = new SourcePodAccess({}, jest.fn());
        expect(await access.fetchFor('https://public.example/ldes/')).toBe(fetch);
    });

    it('selects the most-specific source configuration and reuses its authenticated session', async () => {
        const authenticatedFetch = jest.fn();
        const createSession = jest.fn().mockResolvedValue({ fetch: authenticatedFetch });
        const access = new SourcePodAccess({
            'https://pod.example/': { id: 'pod-id', secret: 'pod-secret', idp: 'https://issuer.example/' },
            'https://pod.example/private/': { id: 'stream-id', secret: 'stream-secret', idp: 'https://issuer.example/' },
        }, createSession);

        expect(await access.fetchFor('https://pod.example/private/ldes/')).toBe(authenticatedFetch);
        expect(await access.fetchFor('https://pod.example/private/events/1')).toBe(authenticatedFetch);
        expect(createSession).toHaveBeenCalledTimes(1);
        expect(createSession).toHaveBeenCalledWith({ id: 'stream-id', secret: 'stream-secret', idp: 'https://issuer.example/' });
    });

    it('reports malformed configured credentials before attempting protected access', async () => {
        const access = new SourcePodAccess({ 'https://pod.example/': { id: '', secret: 'secret', idp: 'https://issuer.example/' } });
        await expect(access.fetchFor('https://pod.example/private/ldes/')).rejects.toThrow('Invalid source-Pod credentials');
    });

    it('uses the same configured session for historical-and-live communication', async () => {
        const createSession = jest.fn().mockResolvedValue({ fetch: jest.fn() });
        const access = new SourcePodAccess({
            'https://pod.example/ldes/': { id: 'id', secret: 'secret', idp: 'https://issuer.example/' },
        }, createSession);
        await access.communicationFor('https://pod.example/ldes/');
        await access.fetchFor('https://pod.example/ldes/event/1');
        expect(createSession).toHaveBeenCalledTimes(1);
    });
});
