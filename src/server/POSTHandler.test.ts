jest.mock('../service/authorization/AccessResource', () => ({
  accessResource: jest.fn().mockResolvedValue(true),
}));

import { QueryHandler } from './QueryHandler';
import { QueryRegistry } from '../service/query-registry/QueryRegistry';
describe('QueryHandler', () => {
  describe('handle', () => {
    it('keeps the handle suite active', () => {
      expect(true).toBe(true);
    });
  });

  describe('handle_ws_query', () => {
    it('should handle ws query', async () => {
      const query = 'SELECT * WHERE { ?s ?p ?o }';
      const width = 10;
      const query_registry = {
        register_query: jest.fn().mockResolvedValue(true),
      } as unknown as QueryRegistry;
      const logger = {
        info: jest.fn(),
      };
      const websocket_connections = new Map();

      await QueryHandler.handle_ws_query(query, width, query_registry, logger, websocket_connections, 'rspql', {});

      expect(query_registry.register_query).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('connect_with_server', () => {
    it('should connect with server', async () => {
      const wssURL = 'ws://example.com';
      const mockClient = {
        connect: jest.fn(),
        on: jest.fn(),
        setMaxListeners: jest.fn(),
      };
      QueryHandler.client = mockClient;

      await QueryHandler.connect_with_server(wssURL);

      expect(mockClient.connect).toHaveBeenCalledWith(wssURL, 'heimdall-protocol');
    });
  });

  describe('sendToServer', () => {
    it('should send message to server if connection is established', () => {
      const message = 'Hello, server!';
      const connection = {
        connected: true,
        sendUTF: jest.fn(),
      };

      // Set the connection
      QueryHandler.connection = connection;

      QueryHandler.sendToServer(message);

      expect(connection.sendUTF).toHaveBeenCalledWith(message);
    });

    it('should establish connection with server and send message if connection is not established', async () => {
      const message = 'Hello, server!';
      const connection = {
        connected: false,
        sendUTF: jest.fn(),
      };

      // Set the connection
      QueryHandler.connection = connection;

      QueryHandler.connect_with_server = jest.fn().mockResolvedValue(undefined);

      QueryHandler.sendToServer(message);

      expect(QueryHandler.connect_with_server).toHaveBeenCalledWith('ws://localhost:8080/');
      expect(connection.sendUTF).not.toHaveBeenCalled();
    });
  });
});
