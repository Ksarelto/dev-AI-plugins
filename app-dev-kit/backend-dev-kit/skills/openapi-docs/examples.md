# openapi-docs examples

## `src/http/openapi.ts`

```ts
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export const ErrorBody = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
    }),
  })
  .strict();

registry.register("ErrorBody", ErrorBody);

export function buildDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "API", version: "1.0.0" },
    servers: [{ url: "/" }],
  });
}
```

Register paths in `src/http/openapi.ts` (import schemas; do not register from routers):

```ts
import { BookCreate, BookRead } from "../schemas/books.js";
import { ErrorBody } from "../schemas/common.js";

registry.register("BookCreate", BookCreate);
registry.register("BookRead", BookRead);

registry.registerPath({
  method: "post",
  path: "/api/v1/books",
  tags: ["books"],
  operationId: "createBook",
  request: { body: { content: { "application/json": { schema: BookCreate } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: BookRead } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorBody } } },
  },
});
```

## Mount in `createApp`

```ts
import swaggerUi from "swagger-ui-express";
import { buildDocument } from "./openapi.js";

app.use("/api/v1", composeV1());
app.get("/openapi.json", (_req, res) => {
  res.json(buildDocument());
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: "/openapi.json" } }));
app.use(errorHandler);
```
