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
