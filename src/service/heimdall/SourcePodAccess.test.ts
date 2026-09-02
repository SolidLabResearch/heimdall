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
        expect(createSession.mock.calls[0][0]).toEqual({ id: 'stream-id', secret: 'stream-secret', idp: 'https://issuer.example/' });
        expect(createSession.mock.calls[0][1]).toBe('https://pod.example');
    });

    it('enforces origin and path boundaries when matching credential prefixes', () => {
        const access = new SourcePodAccess({
            'https://pod.example/alice/': { id: 'alice', secret: 'secret', idp: 'https://issuer.example/' },
        }, jest.fn().mockResolvedValue({ fetch: jest.fn() }));
        expect(access.hasCredentials('https://pod.example/alice/stream/')).toBe(true);
        expect(access.hasCredentials('https://pod.example/alice/profile/card')).toBe(true);
        expect(access.hasCredentials('https://pod.example/alice-other/')).toBe(false);
        expect(access.hasCredentials('https://pod.example.attacker.example/')).toBe(false);
        expect(access.hasCredentials('https://pod.example/alice2/')).toBe(false);
        expect(access.hasCredentials('https://pod.example/alicemalicious/')).toBe(false);
        expect(access.hasCredentials('https://pod.example/alice/private/stream/')).toBe(true);
    });

    it('does not cache a failed session creation forever', async () => {
        const createSession = jest.fn()
            .mockRejectedValueOnce(new Error('temporary authentication failure'))
            .mockResolvedValueOnce({ fetch: jest.fn() });
        const access = new SourcePodAccess({ 'https://pod.example/': { id: 'id', secret: 'secret', idp: 'https://issuer.example/' } }, createSession);
        await expect(access.fetchFor('https://pod.example/stream/')).rejects.toThrow('temporary authentication failure');
        await expect(access.fetchFor('https://pod.example/stream/')).resolves.toBeDefined();
        expect(createSession).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent session creation for one credential entry', async () => {
        let resolveSession!: (value: any) => void;
        const createSession = jest.fn().mockReturnValue(new Promise(resolve => { resolveSession = resolve; }));
        const access = new SourcePodAccess({ 'https://pod.example/': { id: 'id', secret: 'secret', idp: 'https://issuer.example/' } }, createSession);
        const first = access.fetchFor('https://pod.example/a');
        const second = access.fetchFor('https://pod.example/b');
        expect(createSession).toHaveBeenCalledTimes(1);
        resolveSession({ fetch: jest.fn() });
        await Promise.all([first, second]);
    });

    it('allows same-origin discovered resources but not cross-origin token forwarding', async () => {
        const authenticatedFetch = jest.fn();
        const createSession = jest.fn().mockResolvedValue({ fetch: authenticatedFetch });
        const access = new SourcePodAccess({ 'https://pod.example/ldes/': { id: 'id', secret: 'secret', idp: 'https://issuer.example/' } }, createSession);
        expect(await access.fetchFor('https://pod.example/.notifications/', 'https://pod.example/ldes/')).toBe(authenticatedFetch);
        expect(await access.fetchFor('https://notifications.example/subscribe', 'https://pod.example/ldes/')).toBe(fetch);
        expect(createSession).toHaveBeenCalledTimes(1);
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
