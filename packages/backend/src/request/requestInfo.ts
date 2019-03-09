import * as Express from 'express';
import { BaseService } from '@h4bff/core';

/**
 * Keeps a request/response pair from Express, exactly
 * once per service request.
 */
export class RequestInfo extends BaseService {
  req!: Express.Request;
  res!: Express.Response;

  /**
   * @internal
   */
  _setRequestResponse(req: Express.Request, res: Express.Response) {
    this.req = req;
    this.res = res;
  }
}
