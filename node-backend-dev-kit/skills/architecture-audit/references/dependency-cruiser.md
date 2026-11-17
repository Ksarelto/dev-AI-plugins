# dependency-cruiser — reference

Reference `.dependency-cruiser.cjs` for this kit. `npm run lint` runs
`eslint . && depcruise src --config .dependency-cruiser.cjs`; any `error` severity fails it.

```js
/**
 * Layer rules for the domain / query / composition / transport split.
 * A domain repository (and the module that constructs it) may import infra/db.
 * infra/security and infra/db/schema may import shared/permissions for the role enum and JWT claims.
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
      name: 'domain-does-not-import-transport-or-composition',
      comment: 'A domain is a leaf. It does not know HTTP, queries, or wiring.',
      severity: 'error',
      from: { path: '^src/domains/' },
      to: { path: '^src/(api|composition|queries)/' },
    },
    {
      name: 'no-cross-domain',
      comment: 'domains/x imports only itself. Two domains meet in composition/adapters.',
      severity: 'error',
      from: { path: '^src/domains/([^/]+)/' },
      to: { path: '^src/domains/', pathNot: '^src/domains/$1/' },
    },
    {
      name: 'domain-infra-only-from-repository-and-module',
      comment: 'Only the repository and the module that builds it may see the database.',
      severity: 'error',
      from: { path: '^src/domains/', pathNot: '\\.(repository|module)\\.ts$' },
      to: { path: '^src/infra/' },
    },
    {
      name: 'domain-repository-only-db',
      severity: 'error',
      from: { path: '^src/domains/.*\\.(repository|module)\\.ts$' },
      to: { path: '^src/infra/(?!db/)' },
    },
    {
      name: 'transport-no-infra-or-domain-internals',
      comment:
        'HTTP maps DTOs and calls prebound scenarios. It does not touch the database or a repository.',
      severity: 'error',
      from: { path: '^src/api/' },
      to: { path: '^src/(infra|domains)/' },
    },
    {
      name: 'queries-are-a-read-path',
      comment: 'Queries read infra/db and return flat DTOs. They do not call domains or HTTP.',
      severity: 'error',
      from: { path: '^src/queries/' },
      to: { path: '^src/(domains|api|composition)/' },
    },
    {
      name: 'queries-infra-only-db',
      severity: 'error',
      from: { path: '^src/queries/' },
      to: { path: '^src/infra/(?!db/)' },
    },
    {
      name: 'no-deep-domain-imports',
      comment: 'Outside a domain, import its index.ts only.',
      severity: 'error',
      from: { path: '^src/(api|composition|queries)/' },
      to: { path: '^src/domains/', pathNot: '/index\\.ts$' },
    },
    {
      name: 'composition-no-http',
      severity: 'error',
      from: { path: '^src/composition/' },
      to: { path: '^src/api/|node_modules/express/' },
    },
    {
      name: 'infra-does-not-import-the-app',
      severity: 'error',
      from: { path: '^src/infra/' },
      to: { path: '^src/(api|domains|composition|queries)/' },
    },
    {
      name: 'infra-shared-only-permissions',
      comment: 'The role enum and JWT claims are the shared permission set.',
      severity: 'error',
      from: { path: '^src/infra/' },
      to: { path: '^src/shared/', pathNot: '^src/shared/permissions/' },
    },
    {
      name: 'core-imports-only-core',
      comment:
        'Core is technical primitives. It does not know the app, the domains, or the database.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(api|domains|composition|queries|infra|shared|config)/' },
    },
    {
      name: 'shared-imports-only-core',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(api|domains|composition|queries|infra|config)/' },
    },
    {
      name: 'config-is-a-leaf',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/(api|domains|composition|queries|infra|core|shared)/' },
    },
    {
      name: 'app-shell-no-domains-or-queries',
      comment: 'app.ts wires HTTP. main.ts is the process entry and may open the pool.',
      severity: 'error',
      from: { path: '^src/app\\.ts$' },
      to: { path: '^src/(domains|infra|queries)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.d.ts'],
    },
  },
};
```
