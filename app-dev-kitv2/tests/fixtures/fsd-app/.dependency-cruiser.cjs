// Feature-Sliced Design: a layer may import only from layers below it, and only through a slice's
// public index.ts. app → pages → widgets → features → entities → shared.
const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];
const above = (layer) => LAYERS.slice(0, LAYERS.indexOf(layer));
module.exports = {
  forbidden: [
    ...LAYERS.slice(1).map((layer) => ({
      name: `fsd-${layer}-imports-down-only`,
      severity: "error",
      from: { path: `^src/${layer}/` },
      to: { path: `^src/(${above(layer).join("|")})/` },
    })),
    {
      name: "fsd-no-cross-slice-imports",
      severity: "error",
      from: { path: "^src/(pages|widgets|features|entities)/([^/]+)/" },
      to: { path: "^src/$1/(?!$2/)[^/]+/" },
    },
    {
      name: "fsd-public-api-only",
      severity: "error",
      // $1/$2 = the importer's layer and slice: inside its own slice anything goes, elsewhere index.ts only.
      from: { path: "^src/(app|pages|widgets|features|entities|shared)/([^/]+)" },
      to: { path: "^src/(pages|widgets|features|entities)/[^/]+/.+", pathNot: ["^src/$1/$2/", "/index\\.ts$"] },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "\\.test\\.tsx?$" },
  },
};
