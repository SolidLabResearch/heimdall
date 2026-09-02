import { create_subscription, extract_ldp_inbox, extract_subscription_server } from './Util';

describe('notification utilities', () => {
    it('uses the supplied source fetch for protected subscription discovery', async () => {
        const sourceFetch = jest.fn()
            .mockResolvedValueOnce({ headers: new Headers({ link: '<http://example.test/.well-known/solid>; rel="http://www.w3.org/ns/solid/terms#storageDescription"' }) })
            .mockResolvedValueOnce({ text: jest.fn().mockResolvedValue(`
                <http://example.test/> <http://www.w3.org/ns/solid/notifications#subscription> <http://example.test/.notifications/WebhookChannel2023/> .
                <http://example.test/.notifications/WebhookChannel2023/> <http://www.w3.org/ns/solid/notifications#channelType> <http://www.w3.org/ns/solid/notifications#WebhookChannel2023> .
            `) });

        await expect(extract_subscription_server('http://example.test/inbox/', undefined, sourceFetch)).resolves.toEqual({
            location: 'http://example.test/.notifications/WebhookChannel2023/',
            channelType: 'http://www.w3.org/ns/solid/notifications#WebhookChannel2023',
            channelLocation: 'http://example.test/.notifications/WebhookChannel2023/',
        });
        expect(sourceFetch).toHaveBeenNthCalledWith(1, 'http://example.test/inbox/', { method: 'HEAD' });
        expect(sourceFetch).toHaveBeenNthCalledWith(2, 'http://example.test/.well-known/solid', { headers: { Accept: 'text/turtle' } });
    });

    it('reports source discovery failures clearly', async () => {
        const sourceFetch = jest.fn().mockRejectedValue(new Error('Network error'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(extract_subscription_server('http://example.test/resource', undefined, sourceFetch)).rejects.toThrow('Error while extracting subscription server.');
    });

    it('uses the supplied fetch for inbox discovery and subscription creation', async () => {
        const inboxFetch = jest.fn().mockResolvedValue({ text: jest.fn().mockResolvedValue(`
            <http://example.test/ldes/> <http://www.w3.org/ns/ldp#inbox> <inbox/> .
        `) });
        expect(await extract_ldp_inbox('http://example.test/ldes/', undefined, inboxFetch)).toBe('http://example.test/ldes/inbox/');

        const subscriptionFetch = jest.fn().mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('created') });
        expect(await create_subscription('http://example.test/subscribe', 'http://example.test/ldes/inbox/', undefined, subscriptionFetch)).toBe('created');
        expect(subscriptionFetch).toHaveBeenCalledWith('http://example.test/subscribe', expect.objectContaining({ method: 'POST' }));
    });

    it('retains global fetch as the default transport', async () => {
        const globalFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('<http://example.test/ldes/> <http://www.w3.org/ns/ldp#inbox> <inbox/> .'),
        } as any);
        await extract_ldp_inbox('http://example.test/ldes/');
        expect(globalFetch).toHaveBeenCalledWith('http://example.test/ldes/');
        globalFetch.mockRestore();
    });
});
