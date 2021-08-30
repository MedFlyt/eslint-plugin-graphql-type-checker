import { ESLintUtils, TSESTree } from "@typescript-eslint/experimental-utils";
import * as path from "path";

import { RuleOptions, rules } from "./rules";

const ruleTester = new ESLintUtils.RuleTester({
  parser: "@typescript-eslint/parser",
});

const invalidSchemaPath = "src/schemas/invalid-schema.txt";
const ruleOptions: RuleOptions = [
  {
    gqlOperationObjects: {
      Apollo: {
        schemaFilePath: "src/schemas/apollo-schema.graphql",
        operationMethodName: "useQuery",
        gqlLiteralArgumentIndex: 0,
      },
      AgencyMemberGraphQL: {
        schemaFilePath: "src/schemas/agency-member-schema.graphql",
        operationMethodName: "query",
        gqlLiteralArgumentIndex: 1,
      },
      CaregiverGraphQL: {
        schemaFilePath: "src/schemas/caregiver-schema.graphql",
        operationMethodName: "query",
        gqlLiteralArgumentIndex: 1,
      },
      NonexistentSchemaGraphQL: {
        schemaFilePath: "this/schemas/file/does/not/exist.graphql",
        operationMethodName: "query",
        gqlLiteralArgumentIndex: 0,
      },
      InvalidSchemaGraphQL: {
        schemaFilePath: invalidSchemaPath,
        operationMethodName: "query",
        gqlLiteralArgumentIndex: 0,
      },
    },
  },
];

ruleTester.run("Nonexistent schema file", rules["check-query-types"], {
  valid: [],
  invalid: [
    {
      options: ruleOptions,
      code: "NonexistentSchemaGraphQL.query(gql``);",
      errors: [
        {
          type: TSESTree.AST_NODE_TYPES.MemberExpression,
          messageId: "unreadableSchemaFile",
          // We don't test data as data.errorMessage may be platform specific.
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 31,
        },
      ],
    },
  ],
});

ruleTester.run("Invalid schema file", rules["check-query-types"], {
  valid: [],
  invalid: [
    {
      options: ruleOptions,
      code: "InvalidSchemaGraphQL.query(gql``);",
      errors: [
        {
          type: TSESTree.AST_NODE_TYPES.MemberExpression,
          messageId: "invalidGqlSchema",
          data: {
            schemaFilePath: path.resolve(invalidSchemaPath),
            errorMessage: `Syntax Error: Unexpected Name "a".

GraphQL request:1:10
1 | type not a valid schema
  |          ^
2 |`,
          },
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 27,
        },
      ],
    },
  ],
});

ruleTester.run("Parse error in GraphQL template literal string", rules["check-query-types"], {
  valid: [],
  invalid: [
    {
      options: ruleOptions,
      code: "Apollo.useQuery(gql`not a graphql document`, {});",
      errors: [
        {
          type: TSESTree.AST_NODE_TYPES.MemberExpression,
          messageId: "gqlLiteralParseError",
          data: { errorMessage: 'Syntax Error: Unexpected Name "not".' },
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 16,
        },
      ],
    },
  ],
});

ruleTester.run("Validation error in GraphQL template literal string", rules["check-query-types"], {
  valid: [],
  invalid: [
    {
      options: ruleOptions,
      code: "Apollo.useQuery(gql`query {nonexistent_field}`, {});",
      errors: [
        {
          type: TSESTree.AST_NODE_TYPES.MemberExpression,
          messageId: "invalidGqlLiteral",
          data: {
            errorMessage: `Cannot query field "nonexistent_field" on type "Query".

GraphQL request:1:8
1 | query {nonexistent_field}
  |        ^`,
          },

          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 16,
        },
      ],
    },
  ],
});

ruleTester.run("Invalid query type annotation with Apollo schema", rules["check-query-types"], {
  valid: [],
  invalid: [
    {
      options: ruleOptions,
      code: `
Apollo.useQuery<{}, {}>(
  gql\`
    query GetGreeting($language: String!) {
      greeting(language: $language) {
        __typename
        message
      }
    }
  \`,
  args,
);
`,
      output: `
Apollo.useQuery<{ greeting: { __typename: "Greeting"; message: string } }, { language: string }>(
  gql\`
    query GetGreeting($language: String!) {
      greeting(language: $language) {
        __typename
        message
      }
    }
  \`,
  args,
);
`,
      errors: [
        {
          type: TSESTree.AST_NODE_TYPES.TSTypeParameterInstantiation,
          messageId: "invalidQueryType",
          line: 2,
          column: 16,
          endLine: 2,
          endColumn: 24,
        },
      ],
    },
  ],
});

ruleTester.run(
  "Missing query type annotation with CaregiverGraphQL schema",
  rules["check-query-types"],
  {
    valid: [],
    invalid: [
      {
        options: ruleOptions,
        code: `
await CaregiverGraphQL.query(
  conn,
  gql\`
    query ($bundleId: TrainingCenterBundleId!) {
      visibleTrainingCenterBundles(bundle_id: { eq: $bundleId }) {
        caregiver_id
        agency_id
        caregiver_visible_date
        agency {
          name
          website
        }
      }
    }
  \`,
  args,
);
`,
        output: `
await CaregiverGraphQL.query<
  {
    visibleTrainingCenterBundles: ReadonlyArray<{
      caregiver_id: CaregiverId;
      agency_id: AgencyId;
      caregiver_visible_date: LocalDate;
      agency: { name: string; website: string };
    }>;
  },
  { bundleId: TrainingCenterBundleId }
>(
  conn,
  gql\`
    query ($bundleId: TrainingCenterBundleId!) {
      visibleTrainingCenterBundles(bundle_id: { eq: $bundleId }) {
        caregiver_id
        agency_id
        caregiver_visible_date
        agency {
          name
          website
        }
      }
    }
  \`,
  args,
);
`,
        errors: [
          {
            type: TSESTree.AST_NODE_TYPES.MemberExpression,
            messageId: "missingQueryType",
            line: 2,
            column: 7,
            endLine: 2,
            endColumn: 29,
          },
        ],
      },
    ],
  },
);

ruleTester.run(
  "Missing query type annotation with CaregiverGraphQL schema without variables",
  rules["check-query-types"],
  {
    valid: [],
    invalid: [
      {
        options: ruleOptions,
        code: `
await CaregiverGraphQL.query(
    conn,
    gql\`
        query {
            visibleTrainingCenterBundles(bundle_id: { eq: 1 }) {
                caregiver_id
            }
        }
    \`
);
`,
        output: `
await CaregiverGraphQL.query<
  { visibleTrainingCenterBundles: ReadonlyArray<{ caregiver_id: CaregiverId }> },
  Record<PropertyKey, never>
>(
    conn,
    gql\`
        query {
            visibleTrainingCenterBundles(bundle_id: { eq: 1 }) {
                caregiver_id
            }
        }
    \`
);
`,
        errors: [
          {
            type: TSESTree.AST_NODE_TYPES.MemberExpression,
            messageId: "missingQueryType",
            line: 2,
            column: 7,
            endLine: 2,
            endColumn: 29,
          },
        ],
      },
    ],
  },
);
