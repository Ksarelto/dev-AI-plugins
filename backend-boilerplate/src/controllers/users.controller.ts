import type { RequestHandler } from 'express';
import { requirePrincipal } from '../middleware/authenticate.js';
import { validated } from '../middleware/validate.js';
import { listUsersRequest, toUserPageResponse, toUserResponse } from '../schemas/user.schema.js';
import type { UsersService } from '../services/users.service.js';

export function createUsersController(users: UsersService) {
  const me: RequestHandler = async (_req, res) => {
    const principal = requirePrincipal(res);
    res.json(toUserResponse(await users.getById(principal.userId)));
  };

  const list: RequestHandler = async (_req, res) => {
    const { query } = validated(res, listUsersRequest);
    res.json(toUserPageResponse(await users.list(query)));
  };

  return { me, list };
}

export type UsersController = ReturnType<typeof createUsersController>;
