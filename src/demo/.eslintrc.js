module.exports = {
  root: false,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "@medflyt/graphql-type-checker"],
  extends: [],
  rules: {
    "@medflyt/graphql-type-checker/check-query-types": [
      "error",
      {
        gqlOperations: [
          // Note that the paths are relative to the project root, because eslint runs from the root.
          // Ideally, we'd resolve against the location of this file, but eslint does not seem to support
          // this. We also cannot move this file to the root, since it needs to be in the directory with the
          // package.json containing the "file:../.." dependency, and we cannot have that in the root package.
          {
            methodName: "useQuery",
            gqlLiteralArgumentIndex: 0,
            schemaFilePath: "src/schemas/apollo-schema.graphql",
          },
          {
            methodName: "annotateQuery",
            gqlLiteralArgumentIndex: 0,
            schemaFilePath: "src/schemas/apollo-schema.graphql",
          },
          {
            objectName: "AgencyMemberGraphQL",
            methodName: "query",
            gqlLiteralArgumentIndex: 1,
            schemaFilePath: "src/schemas/agency-member-schema.graphql",
          },
          {
            objectName: "CaregiverGraphQL",
            methodName: "query",
            gqlLiteralArgumentIndex: 1,
            schemaFilePath: "src/schemas/caregiver-schema.graphql",
          },
          {
            objectName: "NonexistentSchemaGraphQL",
            methodName: "query",
            gqlLiteralArgumentIndex: 0,
            schemaFilePath: "this/schemas/file/does/not/exist.graphql",
          },
          {
            objectName: "InvalidSchemaGraphQL",
            methodName: "query",
            gqlLiteralArgumentIndex: 0,
            schemaFilePath: "src/schemas/invalid-schema.txt",
          },
        ],
      },
    ],
  },
};
