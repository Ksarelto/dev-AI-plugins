import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.js';
import {
  loginRequest,
  refreshRequest,
  registerRequest,
  toAuthResponse,
} from '../schemas/auth.schema.js';
import type { AuthService } from '../services/auth.service.js';

/** HTTP ↔ service mapping only: read validated input, call one service method, shape the response. */
export function createAuthController(auth: AuthService) {
  const register: RequestHandler = async (_req, res) => {
    const { body } = validated(res, registerRequest);
    const result = await auth.register(body);
    res.status(201).json(toAuthResponse(result));
  };

  const login: RequestHandler = async (_req, res) => {
    const { body } = validated(res, loginRequest);
    res.json(toAuthResponse(await auth.login(body)));
  };

  const refresh: RequestHandler = async (_req, res) => {
    const { body } = validated(res, refreshRequest);
    res.json(toAuthResponse(await auth.refresh(body.refreshToken)));
  };

  const logout: RequestHandler = async (_req, res) => {
    const { body } = validated(res, refreshRequest);
    await auth.logout(body.refreshToken);
    res.status(204).end();
  };

  return { register, login, refresh, logout };
}

export type AuthController = ReturnType<typeof createAuthController>;
