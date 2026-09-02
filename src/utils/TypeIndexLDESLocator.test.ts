import { TypeIndexLDESLocator } from './TypeIndexLDESLocator';

describe('TypeIndexLDESLocator', () => {
    it('uses source-Pod access when looking up a protected Type Index', async () => {
        const authenticatedFetch = jest.fn().mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue(`
                <https://pod.example/registration> <https://saref.etsi.org/core/relatesToProperty> <https://metric.example/temperature> .
            `),
        });
        const sourcePodAccess = { fetchFor: jest.fn().mockResolvedValue(authenticatedFetch) };
        const locator = new TypeIndexLDESLocator('https://pod.example', sourcePodAccess as any);

        await expect(locator.getLDESStreamURL('https://metric.example/temperature')).resolves.toBe('https://pod.example/registration');
        expect(sourcePodAccess.fetchFor).toHaveBeenCalledWith('https://pod.example/settings/publicTypeIndex');
        expect(authenticatedFetch).toHaveBeenCalledWith('https://pod.example/settings/publicTypeIndex', { headers: { Accept: 'text/turtle' } });
    });
});
