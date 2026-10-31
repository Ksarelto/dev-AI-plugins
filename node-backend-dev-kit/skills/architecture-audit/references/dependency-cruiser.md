# dependency-cruiser — reference

Verbatim `.dependency-cruiser.cjs` from `backend-boilerplate/`. `npm run lint` runs
`eslint . && depcruise src --config .dependency-cruiser.cjs`; any `error` severity fails it.

```js
/**
 * Layer rules: routes → controllers → services → repositories → db.
 * lib/ and config/ are leaves that any layer may use; they import no layer.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'routes-only-wire',
      comment:
        'Routes wire middleware to controllers; they never call services, repositories or the db.',
      severity: 'error',
      from: { path: '^src/routes/' },
      to: { path: '^src/(services|repositories|db)/' },
    },
    {
      name: 'controllers-no-data-access',
      comment: 'Controllers map HTTP to service calls; data access goes through a service.',
      severity: 'error',
      from: { path: '^src/controllers/' },
      to: { path: '^src/(repositories|db|routes)/' },
    },
    {
      name: 'services-no-http',
      comment: 'Services hold business rules and stay HTTP-agnostic.',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^(src/(routes|controllers|middleware)/|node_modules/express/)' },
    },
    {
      name: 'repositories-are-leaves',
      comment: 'Repositories only talk to the db layer.',
      severity: 'error',
      from: { path: '^src/repositories/' },
      to: { path: '^src/(routes|controllers|services|middleware)/' },
    },
    {
      name: 'lib-is-a-leaf',
      severity: 'error',
      from: { path: '^src/(lib|config)/' },
      to: { path: '^src/(routes|controllers|services|repositories|middleware|db)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
    },
  },
};
```

## Running

```bash
npx depcruise src --config .dependency-cruiser.cjs                      # fails on violations
npx depcruise src --config .dependency-cruiser.cjs --output-type err-long  # rule comments included
npx depcruise src --include-only '^src' --output-type text | grep services # who imports what
```

If the project has no config, install `dependency-cruiser` as a dev dependency, copy the file above, add it
to the `lint` script, and run it once to get the baseline. Do this only after the user confirms the finding
"missing enforcement".

## What the shipped config does not enforce

These ARCHITECTURE.md invariants have no rule yet. Check them with the greps in
[layers.md](layers.md#semantic-checks) and, when the user agrees, add rules like these:

```js
{
  name: 'db-is-below-every-layer',
  comment: 'db/ (client, schema, migrations, transaction runner) imports only lib/ and config/.',
  severity: 'error',
  from: { path: '^src/db/' },
  to: { path: '^src/(routes|controllers|services|repositories|middleware|schemas)/' },
},
{
  name: 'middleware-no-business',
  comment: 'Middleware is cross-cutting HTTP; it never calls services, repositories or the db.',
  severity: 'error',
  from: { path: '^src/middleware/' },
  to: { path: '^src/(routes|controllers|services|repositories|db)/' },
},
{
  name: 'schemas-no-data-access',
  comment: 'Schemas and DTO mappers may import service types, never repositories, db or HTTP layers.',
  severity: 'error',
  from: { path: '^src/schemas/' },
  to: { path: '^src/(routes|controllers|repositories|db)/' },
},
```

Run `npm run lint` after adding a rule; on the unmodified boilerplate all three pass.
