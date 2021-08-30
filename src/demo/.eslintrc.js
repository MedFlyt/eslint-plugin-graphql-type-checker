module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', '@medflyt/graphql-type-checker'],
  extends: [],
  rules: {
    '@medflyt/graphql-type-checker/check-query-types': [
      'error',
      {
        annotationTargets: [
          // Note that the paths are relative to the project root, because eslint runs from the root.
          // Ideally, we'd resolve against the location of this file, but eslint does not seem to support
          // this. We also cannot move this file to the root, since it needs to be in the directory with the
          // package.json containing the "file:../.." dependency, and we cannot have that in the root package.
          {
            function: { name: 'useQuery' },
            schemaFilePath: 'src/schemas/apollo-schema.graphql',
          },
          {
            function: { name: 'annotateQuery' },
            schemaFilePath: 'src/schemas/apollo-schema.graphql',
          },
          {
            taggedTemplate: { name: 'tgql' },
            schemaFilePath: 'src/schemas/apollo-schema.graphql',
          },
          {
            method: {
              objectName: 'AgencyMemberGraphQL',
              methodName: 'query',
            },
            schemaFilePath: 'src/schemas/agency-member-schema.graphql',
          },
          {
            method: {
              objectName: 'CaregiverGraphQL',
              methodName: 'query',
            },
            schemaFilePath: 'src/schemas/caregiver-schema.graphql',
          },
          {
            method: {
              objectName: 'NonexistentSchemaGraphQL',
              methodName: 'query',
            },
            schemaFilePath: 'this/schemas/file/does/not/exist.graphql',
          },
          {
            method: {
              objectName: 'InvalidSchemaGraphQL',
              methodName: 'query',
            },
            schemaFilePath: 'src/schemas/invalid-schema.txt',
          },
        ],
      },
    ],
  },
}
