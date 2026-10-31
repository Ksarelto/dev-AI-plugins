/**
 * HTTP layers: routes → controllers → services → repositories → db (same as backend-boilerplate).
 * Agent layers: services drive agents/; agents use tools, llm, rag (through interfaces) and guardrails.
 * lib/, config/, guardrails/ are leaves.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'routes-only-wire',
      severity: 'error',
      from: { path: '^src/routes/' },
      to: { path: '^src/(services|repositories|db|agents|rag|llm|memory)/' },
    },
    {
      name: 'controllers-no-data-or-agents',
      comment:
        'Controllers call services; they never touch the graph, retrieval or the db directly.',
      severity: 'error',
      from: { path: '^src/controllers/' },
      to: { path: '^src/(repositories|db|routes|agents|rag|memory)/' },
    },
    {
      name: 'services-no-http',
      severity: 'error',
      from: { path: '^src/services/' },
      to: { path: '^(src/(routes|controllers|middleware)/|node_modules/express/)' },
    },
    {
      name: 'agents-no-http-no-db',
      comment:
        'Graphs, nodes and tools get retrieval and models injected; they know nothing about HTTP or SQL.',
      severity: 'error',
      from: { path: '^src/agents/' },
      to: {
        path: '^(src/(routes|controllers|middleware|services|repositories|db)/|node_modules/express/)',
      },
    },
    {
      name: 'llm-is-a-leaf',
      severity: 'error',
      from: { path: '^src/llm/' },
      to: { path: '^src/(routes|controllers|services|repositories|agents|rag|db)/' },
    },
    {
      name: 'repositories-are-leaves',
      severity: 'error',
      from: { path: '^src/repositories/' },
      to: { path: '^src/(routes|controllers|services|middleware|agents|rag|llm)/' },
    },
    {
      name: 'leaves-import-no-layer',
      severity: 'error',
      from: { path: '^src/(lib|config|guardrails)/' },
      to: {
        path: '^src/(routes|controllers|services|repositories|middleware|db|agents|rag|llm|memory)/',
      },
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
