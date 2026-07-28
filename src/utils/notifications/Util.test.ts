import axios from 'axios';
import { create_subscription, extract_ldp_inbox, extract_subscription_server } from './Util';

jest.mock('axios');
describe('Util_Functions', () => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should_extract_subscription_server_from_resource', async () => {
        const mockHeadResponse = {
            headers: {
                vary: 'Accept,Authorization,Origin',
                'x-powered-by': 'Community Solid Server',
                'access-control-allow-origin': '*',
                'access-control-allow-credentials': 'true',
                'access-control-expose-headers': 'Accept-Patch,Accept-Post,Accept-Put,Allow,Content-Range,ETag,Last-Modified,Link,Location,Updates-Via,WAC-Allow,Www-Authenticate',
                allow: 'OPTIONS, HEAD, GET, PATCH, PUT, DELETE',
                'accept-patch': 'text/n3, application/sparql-update',
                'accept-put': '*/*',
                'content-type': 'text/turtle',
                link: '<http://www.w3.org/ns/ldp#Resource>; rel="type", <http://localhost:3000/aggregation_pod/311c1859-00ca-4289-8b38-d9bca3ffc1b2.meta>; rel="describedby", <http://localhost:3000/aggregation_pod/.well-known/solid>; rel="http://www.w3.org/ns/solid/terms#storageDescription"',
                'last-modified': 'Tue, 27 Feb 2024 11:47:34 GMT',
                etag: '"1709034454000-text/turtle"',
                'content-length': '645928',
                date: 'Tue, 05 Mar 2024 12:41:48 GMT',
                connection: 'keep-alive',
                'keep-alive': 'timeout=5'
            }
        };

        const mockGetResponse = {
            data: `
            <http://localhost:3000/aggregation_pod/> a <http://www.w3.org/ns/pim/space#Storage>;
        <http://www.w3.org/ns/solid/notifications#subscription> <http://localhost:3000/.notifications/WebhookChannel2023/>.
        <http://localhost:3000/.notifications/WebhookChannel2023/> <http://www.w3.org/ns/solid/notifications#channelType> <http://www.w3.org/ns/solid/notifications#WebhookChannel2023>;
        <http://www.w3.org/ns/solid/notifications#feature> <http://www.w3.org/ns/solid/notifications#accept>, <http://www.w3.org/ns/solid/notifications#endAt>, <http://www.w3.org/ns/solid/notifications#rate>, <http://www.w3.org/ns/solid/notifications#startAt>, <http://www.w3.org/ns/solid/notifications#state>.
            `
        };
        
        (axios.head as jest.Mock).mockResolvedValue(mockHeadResponse);
        (axios.get as jest.Mock).mockResolvedValue(mockGetResponse);
        jest.spyOn(console, 'error').mockImplementation(() => { });

        const result = await extract_subscription_server('http://localhost:3000/aggregation_pod/');
        expect(axios.head).toHaveBeenCalledWith('http://localhost:3000/aggregation_pod/');
        expect(axios.get).toHaveBeenCalledWith('http://localhost:3000/aggregation_pod/.well-known/solid');
        expect(console.error).not.toHaveBeenCalled();
        expect(result).toEqual({
            location: 'http://localhost:3000/.notifications/WebhookChannel2023/',
            channelType: 'http://www.w3.org/ns/solid/notifications#WebhookChannel2023',
            channelLocation: 'http://localhost:3000/.notifications/WebhookChannel2023/'
        });
    });

    it('should_throw_an_error_if_there_is_an_error_while_extracting_subscription_server', async () => {
        (axios.head as jest.Mock).mockRejectedValue(new Error('Network error'));
        jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(extract_subscription_server('http://example.com/resource')).rejects.toThrowError(
            'Error while extracting subscription server.'
        );

        expect(axios.head).toHaveBeenCalledWith('http://example.com/resource');
        expect(console.error).toHaveBeenCalled();
    });

    it('should_extract_ldp_inbox_from_ldes_stream_location', async () => {
        const mockResponse = {
            text: jest.fn().mockResolvedValue(`
                @prefix ldp: <http://www.w3.org/ns/ldp#>.
                <http://example.com/resource> ldp:inbox <inbox>.
            `)
        };
    
        jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    
        const result = await extract_ldp_inbox('http://example.com/resource');
    
        expect(global.fetch).toHaveBeenCalledWith('http://example.com/resource');
        expect(console.error).not.toHaveBeenCalled();
        expect(result).toBe('http://example.com/resourceinbox');
    });
    it('should_create_subscription', async () => {
        const mockSubscriptionServer = 'http://example.com/subscription';
        const mockInboxLocation = 'http://example.com/inbox';
        const mockResponse = {
            text: jest.fn().mockResolvedValue('Subscription created successfully.')
        };
        jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await create_subscription(mockSubscriptionServer, mockInboxLocation);

        expect(global.fetch).toHaveBeenCalledWith(mockSubscriptionServer, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/ld+json'
            },
            body: JSON.stringify({
                "@context": ["https://www.w3.org/ns/solid/notification/v1"],
                "type": "http://www.w3.org/ns/solid/notifications#WebhookChannel2023",
                "topic": `${mockInboxLocation}`,
                "sendTo": "http://n078-22.wall1.ilabt.imec.be:8080/"
            })
        });
        expect(console.error).not.toHaveBeenCalled();
        expect(result).toBe('Subscription created successfully.');
    });
});
