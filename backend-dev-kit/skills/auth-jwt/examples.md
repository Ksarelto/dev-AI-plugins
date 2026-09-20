# auth-jwt examples

Defer libraries to `rules/stack.mdc`. Access secret is `env.JWT_SECRET` (hmac).

## Tables

```ts
// src/db/tables/users.ts
import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// src/db/tables/refresh-tokens.ts
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Re-export both from `src/db/tables/index.ts`.

## Token helpers (`src/services/tokens.ts`)

```ts
import { createHmac, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

const accessKey = new TextEncoder().encode(env.JWT_SECRET);

export async function signAccess(user: { id: string; role: string }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessKey);
}

export async function verifyAccess(token: string) {
  const { payload } = await jwtVerify(token, accessKey);
  return { sub: String(payload.sub), role: String(payload.role) };
}

export function newRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRefresh(token: string) {
  return createHmac("sha256", env.JWT_SECRET).update(token).digest("hex");
}
```

## Middleware (`src/http/middleware/auth.ts`)

```ts
import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError, ForbiddenError } from "../../errors/app-error.js";
import type { UserRead } from "../../schemas/users.js";
import { verifyAccess } from "../../services/tokens.js";

function bearer(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError();
  return header.slice(7);
}

export function requireAuth(getUser: (id: string) => Promise<UserRead>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const claims = await verifyAccess(bearer(req.headers.authorization));
      const user = await getUser(claims.sub);
      if (!user.isActive) throw new UnauthorizedError();
      req.user = user;
      next();
    } catch (err) {
      res.setHeader("WWW-Authenticate", "Bearer");
      next(err instanceof UnauthorizedError ? err : new UnauthorizedError());
    }
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ForbiddenError(`Requires one of roles: ${roles.join(", ")}`));
      return;
    }
    next();
  };
}
```

Bind once in `src/http/compose.ts`: `const authed = requireAuth((id) => users.getById(id));`

## Router surface

`POST /api/v1/auth/register` → 201 `{ accessToken, refreshToken, expiresIn }`  
`POST /api/v1/auth/token` → 200 same (rate-limited)  
`POST /api/v1/auth/refresh` → 200 same, old refresh revoked  
`GET /api/v1/auth/me` → 200 UserRead  

Login with a wrong password is **401**, never 404.
