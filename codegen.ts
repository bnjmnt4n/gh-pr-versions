import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "resources/schema.graphql",
  documents: ["resources/pull_request.graphql"],
  generates: {
    "./src/__generated__/graphql.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        documentMode: "string",
        enumsAsTypes: true,
        scalars: {
          DateTime: "string",
          URI: "string",
          GitObjectID: "string",
        },
      },
    },
  },
};

export default config;
