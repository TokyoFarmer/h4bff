import * as Promise from 'bluebird';
import { AppContainer, BaseService, ServiceContextEvents } from '@h4bff/core';
import { Request, Response } from 'express';
import { RequestInfo } from '../request';
import { RPCDispatcher } from './dispatcher';
import { RPCServiceRegistry } from './serviceRegistry';
import { RPCMiddlewareContainer } from './middleware';

describe('RPCDispatcher', () => {
  function mockRequest(method?: string, params?: any) {
    const req = {} as Request;
    req.query = { method };
    req.body = { params };
    return req;
  }

  function mockResponse() {
    const res = {} as Response;
    res.status = jest.fn(() => res);
    res.json = jest.fn();
    return res;
  }

  describe('handleRequest', () => {
    it(`should respond with error if method is not found in the request qyery params`, () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest();
          res = mockResponse();
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return Promise.resolve(rpcDispatcher.handleRequest()).then(() => {
        expect(requestInfo.res.status).toHaveBeenCalledWith(400);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 400,
          result: null,
          error: {
            code: 400,
            message: '"method" query parameter not found',
          },
          version: 2,
          backendError: true,
        });
      });
    });

    it(`should respond with error if body params are not found in the request`, () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method');
          res = mockResponse();
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return Promise.resolve(rpcDispatcher.handleRequest()).then(() => {
        expect(requestInfo.res.status).toHaveBeenCalledWith(400);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 400,
          result: null,
          error: {
            code: 400,
            message: '"params" not found, send an empty object in case of no parameters',
          },
          version: 2,
          backendError: true,
        });
      });
    });

    it(`should respond with error if method does't exist on the service`, () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method', {});
          res = mockResponse();
        },
      );
      // prepare mock service
      container.getSingleton(RPCServiceRegistry).add(
        'test',
        class TestService extends BaseService {
          none() {
            return Promise.resolve();
          }
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return Promise.resolve(rpcDispatcher.handleRequest()).then(() => {
        expect(requestInfo.res.status).toHaveBeenCalledWith(404);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 404,
          result: null,
          error: {
            code: 404,
            message: 'Method not found',
          },
          version: 2,
          backendError: true,
        });
      });
    });
  });

  describe('RPC call execution', () => {
    it('should respond with success and dispose context in normal circumstances', () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method', {});
          res = mockResponse();
        },
      );
      // mock middleware call
      container.overrideSingleton(
        RPCMiddlewareContainer,
        class MockRPCMiddlewareContainer extends RPCMiddlewareContainer {
          call = jest.fn(() => Promise.resolve('data'));
        },
      );
      // mock disposeContext call
      container.overrideSingleton(
        ServiceContextEvents,
        class MockServiceContextEvents extends ServiceContextEvents {
          disposeContext = jest.fn(() => Promise.resolve());
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return rpcDispatcher.call().then(() => {
        expect(requestInfo.res.status).toHaveBeenCalledWith(200);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 200,
          result: 'data',
          error: null,
          version: 2,
        });
        expect(container.getSingleton(ServiceContextEvents).disposeContext).toHaveBeenCalled();
      });
    });

    it('should respond with custom success response and dispose context for specific results', () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method', {});
          res = mockResponse();
        },
      );
      // mock middleware call and prepare custom response
      let mockData = {
        sendToHTTPResponse: jest.fn(() => Promise.resolve('test')),
      };
      container.overrideSingleton(
        RPCMiddlewareContainer,
        class MockRPCMiddlewareContainer extends RPCMiddlewareContainer {
          call = jest.fn(() => Promise.resolve(mockData));
        },
      );
      // mock disposeContext call
      container.overrideSingleton(
        ServiceContextEvents,
        class MockServiceContextEvents extends ServiceContextEvents {
          disposeContext = jest.fn(() => Promise.resolve());
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return rpcDispatcher.call().then(() => {
        expect(container.getSingleton(ServiceContextEvents).disposeContext).toHaveBeenCalled();
        expect(mockData.sendToHTTPResponse).toHaveBeenCalledWith(requestInfo.res, 200);
      });
    });

    it('should respond with error response when the RPC call fails', () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method', {});
          res = mockResponse();
        },
      );
      // mock middleware call and prepare erroneous response
      container.overrideSingleton(
        RPCMiddlewareContainer,
        class MockRPCMiddlewareContainer extends RPCMiddlewareContainer {
          call = jest.fn(() => Promise.reject({ code: 403, message: 'error' }));
        },
      );
      // mock disposeContext call
      container.overrideSingleton(
        ServiceContextEvents,
        class MockServiceContextEvents extends ServiceContextEvents {
          disposeContext = jest.fn(() => Promise.resolve());
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return rpcDispatcher.call().then(() => {
        expect(container.getSingleton(ServiceContextEvents).disposeContext).toHaveBeenCalled();
        expect(requestInfo.res.status).toHaveBeenCalledWith(403);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 403,
          result: null,
          error: {
            code: 403,
            message: 'error',
          },
          version: 2,
          backendError: true,
        });
      });
    });

    it('should respond with validation error response when the RPC call fails with validation data', () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method', {});
          res = mockResponse();
        },
      );
      // mock middleware call and prepare erroneous response
      container.overrideSingleton(
        RPCMiddlewareContainer,
        class MockRPCMiddlewareContainer extends RPCMiddlewareContainer {
          call = jest.fn(() => Promise.reject({ isJoi: true, details: [] }));
        },
      );
      // mock disposeContext call
      container.overrideSingleton(
        ServiceContextEvents,
        class MockServiceContextEvents extends ServiceContextEvents {
          disposeContext = jest.fn(() => Promise.resolve());
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return rpcDispatcher.call().then(() => {
        expect(container.getSingleton(ServiceContextEvents).disposeContext).toHaveBeenCalled();
        expect(requestInfo.res.status).toHaveBeenCalledWith(400);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 400,
          result: null,
          error: {
            code: 400,
            message: 'Technical error, the request was malformed.',
          },
          version: 2,
          backendError: true,
        });
      });
    });

    it('should respond with 500 error response when the RPC call fails with unknown error', () => {
      let container = new AppContainer();
      // prepare request / response
      container.overrideService(
        RequestInfo,
        class MockRequestInfo extends RequestInfo {
          req = mockRequest('test.method', {});
          res = mockResponse();
        },
      );
      // mock middleware call and prepare erroneous response
      container.overrideSingleton(
        RPCMiddlewareContainer,
        class MockRPCMiddlewareContainer extends RPCMiddlewareContainer {
          call = jest.fn(() => Promise.reject('error'));
        },
      );
      // mock disposeContext call
      container.overrideSingleton(
        ServiceContextEvents,
        class MockServiceContextEvents extends ServiceContextEvents {
          disposeContext = jest.fn(() => Promise.resolve());
        },
      );
      const sCtx = container.createServiceContext();
      let rpcDispatcher = sCtx.getService(RPCDispatcher);
      let requestInfo = sCtx.getService(RequestInfo);

      return rpcDispatcher.call().then(() => {
        expect(container.getSingleton(ServiceContextEvents).disposeContext).toHaveBeenCalled();
        expect(requestInfo.res.status).toHaveBeenCalledWith(500);
        expect(requestInfo.res.json).toHaveBeenCalledWith({
          code: 500,
          result: null,
          error: {
            code: 500,
            message: 'Something bad happened.',
          },
          version: 2,
          backendError: true,
        });
      });
    });
  });
});
