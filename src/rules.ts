import { ESLintUtils, TSESTree, TSESLint } from '@typescript-eslint/experimental-utils'
import * as parser from '@typescript-eslint/parser'
import * as fs from 'fs'
import * as graphql from 'graphql'
import * as path from 'path'
import * as prettier from 'prettier'

import * as codeGenerator from './codeGenerator'
import * as eslintUtils from './eslintUtils'
import * as utils from './utils'

import type { JSONSchema4 } from 'json-schema'

const messages = {
  noInterpolation: 'Interpolation not allowed in gql tagged templates',
  gqlLiteralParseError: 'Parse error in gql tagged template:\n\n{{errorMessage}}',
  unreadableSchemaFile: "Cannot read GraphQL schema file at '{{schemaFilePath}}':\n\n{{errorMessage}}",
  invalidGqlSchema: "Invalid GraphQL schema at '{{schemaFilePath}}':\n\n{{errorMessage}}",
  invalidGqlLiteral: 'Invalid GraphQL document in tagged template:\n\n{{errorMessage}}',
  noMultipleDefinitions: 'Only a single definition is allowed in gql  tagged templates',
  onlyQueryOperations: "Only 'query' operations are allowed in gql tagged templates",
  missingQueryType: 'Target should have a type annotation that matches the GraphQL query type',
  invalidQueryType: 'Target type annotation does not match GraphQL query type',
  unhandledPluginException:
    'Unhandled exception in graphql-type-checker plugin, probably due to a bug in the plugin. ' +
    'Note that the query type annotations may be incorrect.\n\n{{errorMessage}}',
}
type MessageId = keyof typeof messages

type RuleContext = TSESLint.RuleContext<MessageId, RuleOptions>

type RuleReporter = (report: TSESLint.ReportDescriptor<MessageId>) => void

const checkQueryTypesRuleSchema: JSONSchema4 = {
  type: 'array',
  minItems: 1,
  maxItems: 1,
  items: {
    type: 'object',
    required: ['annotationTargets'],
    properties: {
      annotationTargets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            function: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
            method: {
              type: 'object',
              properties: {
                objectName: { type: 'string' },
                methodName: { type: 'string' },
              },
              required: ['objectName', 'methodName'],
            },
            taggedTemplate: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
            schemaFilePath: { type: 'string' },
          },
          oneOf: [
            {
              required: ['function'],
            },
            {
              required: ['method'],
            },
            {
              required: ['taggedTemplate'],
            },
          ],
          required: ['schemaFilePath'],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
}

type FunctionTarget = { function: { name: string } }
type MethodTarget = {
  method: { objectName: string; methodName: string }
}
type TaggedTemplateTarget = { taggedTemplate: { name: string } }
export type RuleOptions = [
  {
    annotationTargets: Array<
      (FunctionTarget | MethodTarget | TaggedTemplateTarget) & {
        schemaFilePath: string
      }
    >
  },
]

const getTaggedTemplateConfig = (ruleOptions: RuleOptions, tagName: string) => {
  const matchingTargets = ruleOptions[0].annotationTargets.filter(
    (target) => 'taggedTemplate' in target && target.taggedTemplate.name === tagName,
  )

  if (matchingTargets.length === 0) {
    return null
  }
  return matchingTargets[0]
  // TODO: Validate that tagNames are unique. (can't throw or report here, or we'll have errors on every method call).
}

const getFunctionTargetConfig = (ruleOptions: RuleOptions, functionName: string) => {
  const matchingTargets = ruleOptions[0].annotationTargets.filter(
    (target): target is FunctionTarget & { schemaFilePath: string } =>
      'function' in target && target.function.name === functionName,
  )

  if (matchingTargets.length === 0) {
    return null
  }
  return matchingTargets[0]
  // TODO: Validate that objectName/methodName pairs are unique. (can't throw or report here, or we'll have errors on
  // every method call).
}

const getMethodTargetConfig = (ruleOptions: RuleOptions, objectName: string, methodName: string) => {
  const matchingTargets = ruleOptions[0].annotationTargets.filter(
    (target): target is MethodTarget & { schemaFilePath: string } =>
      'method' in target && target.method.objectName === objectName && target.method.methodName === methodName,
  )

  if (matchingTargets.length === 0) {
    return null
  }
  return matchingTargets[0]
  // TODO: Validate that objectName/methodName pairs are unique. (can't throw or report here, or we'll have errors on
  // every method call).
}

const checkQueryTypes_RuleListener = (context: RuleContext): TSESLint.RuleListener => {
  const listener: TSESLint.RuleListener = {
    // Easy AST viewing: https://ts-ast-viewer.com/

    TaggedTemplateExpression(expr: TSESTree.TaggedTemplateExpression) {
      if (expr.tag.type === 'Identifier') {
        const targetConfig = getTaggedTemplateConfig(context.options, expr.tag.name)
        if (targetConfig !== null) {
          const { schemaFilePath } = targetConfig
          const gqlStr = getGqlString(context.report, expr)
          if (gqlStr !== null) {
            checkQueryTypes_Rule(context, schemaFilePath, expr, gqlStr, expr.tag, expr.typeParameters)
          }
        }
      }
    },

    CallExpression(callExpression) {
      try {
        const { callee, arguments: args } = callExpression

        const targetFunctionAndConfig =
          callee.type === 'Identifier'
            ? ([callee, getFunctionTargetConfig(context.options, callee.name)] as const)
            : callee.type === 'MemberExpression' &&
              callee.object.type === 'Identifier' &&
              callee.property.type === 'Identifier'
            ? ([
                callee.property,
                getMethodTargetConfig(context.options, callee.object.name, callee.property.name),
              ] as const)
            : null

        if (targetFunctionAndConfig !== null && targetFunctionAndConfig[1] !== null) {
          const [targetFunction, targetConfig] = targetFunctionAndConfig

          const { schemaFilePath } = targetConfig

          const typeAnnotation = callExpression.typeParameters

          // Take the first tagged-template argument with tag 'gql' as our taggedGqlTemplate.
          const taggedGqlTemplate = args.find(
            (arg): arg is TSESTree.TaggedTemplateExpression =>
              arg.type === 'TaggedTemplateExpression' && arg.tag.type === 'Identifier' && arg.tag.name === 'gql',
          )

          // We don't error if the template argument does not exist, since the function may have been called with a
          // variable instead, or have an overload with fewer parameters. Instead, we just don't trigger the rule.
          if (taggedGqlTemplate !== undefined) {
            const gqlStr = getGqlString(context.report, taggedGqlTemplate)
            if (gqlStr !== null) {
              checkQueryTypes_Rule(context, schemaFilePath, taggedGqlTemplate, gqlStr, targetFunction, typeAnnotation)
            }
          }
        }
      } catch (error) {
        context.report({
          node: callExpression.callee,
          messageId: 'unhandledPluginException',
          data: { errorMessage: `${error.message}\n${error.stack}` },
        })
      }
    },
  }
  return listener
}
const checkQueryTypes_Rule = (
  context: RuleContext,
  schemaFilePath: string,
  taggedGqlTemplate: TSESTree.TaggedTemplateExpression,
  gqlStr: string,
  annotationTarget: TSESTree.Identifier,
  typeAnnotation?: TSESTree.TSTypeParameterInstantiation,
) => {
  const absoluteSchemaFilePath = path.resolve(schemaFilePath)
  const schemaFileContentsResult = readSchema(absoluteSchemaFilePath)
  if (utils.isError(schemaFileContentsResult)) {
    context.report({
      node: annotationTarget, // Don't report on gql literal because it will squiggle over gql plugin errors.
      messageId: 'unreadableSchemaFile',
      data: {
        schemaFilePath: absoluteSchemaFilePath,
        errorMessage: schemaFileContentsResult.error,
      },
    })
  } else {
    const schemaFileContents = schemaFileContentsResult.value
    const schemaResult = utils.catchExceptions(graphql.buildSchema)(schemaFileContents)

    if (utils.isError(schemaResult)) {
      context.report({
        // Don't report on gql literal because it will squiggle over gql plugin errors.
        node: annotationTarget,
        messageId: 'invalidGqlSchema',
        data: { schemaFilePath: absoluteSchemaFilePath, errorMessage: schemaResult.error },
      })
    } else {
      const schema = schemaResult.value
      {
        const res = utils.catchExceptions(graphql.parse)(gqlStr)
        if (utils.isError(res)) {
          context.report({
            node: annotationTarget,
            messageId: 'gqlLiteralParseError',
            data: { errorMessage: res.error.message },
          })
        } else {
          const gqlOperationDocument = res.value

          const validationReportDescriptor = validateGraphQLDoc(
            schema,
            annotationTarget,
            taggedGqlTemplate,
            gqlOperationDocument,
          )
          if (validationReportDescriptor) {
            context.report(validationReportDescriptor)
          } else {
            const { argumentsType, resultType } = codeGenerator.generateTypes(schema, gqlOperationDocument)
            const inferredTypeAnnotationStr = `<${resultType}, ${argumentsType}>`

            const currentTypeAnnotationStr = typeAnnotation
              ? context.getSourceCode().text.slice(typeAnnotation.range[0], typeAnnotation.range[1])
              : ''

            if (!compareTypeAnnotations(currentTypeAnnotationStr, inferredTypeAnnotationStr)) {
              const {
                messageId,
                node,
                inferredAnnotationRange,
              }: {
                messageId: MessageId
                node: TSESTree.Node
                inferredAnnotationRange: [number, number]
              } = typeAnnotation
                ? {
                    messageId: 'invalidQueryType',
                    node: typeAnnotation,
                    inferredAnnotationRange: typeAnnotation.range,
                  }
                : {
                    messageId: 'missingQueryType',
                    node: annotationTarget,
                    inferredAnnotationRange: [annotationTarget.range[1], annotationTarget.range[1]],
                  }

              const typeStr = prettifyAnnotationInPlace(
                context,
                annotationTarget,
                inferredAnnotationRange,
                inferredTypeAnnotationStr,
              )
              const reportDescriptor: TSESLint.ReportDescriptor<MessageId> = {
                messageId,
                node,
                fix(fix) {
                  return fix.replaceTextRange(inferredAnnotationRange, typeStr)
                },
              }
              context.report(reportDescriptor)
            }
          }
        }
      }
    }
  }
}

function getGqlString(report: RuleReporter, expr: TSESTree.TaggedTemplateExpression) {
  if (expr.quasi.expressions.length) {
    report({
      node: expr.quasi.expressions[0],
      messageId: 'noInterpolation',
    })

    return null
  }
  return expr.quasi.quasis[0].value.cooked
}

const readSchema = (schemaFilePath: string): utils.ValueOrError<string, string> => {
  try {
    return { value: fs.readFileSync(schemaFilePath, 'utf8') }
  } catch (error) {
    return { error }
  }
}

// Validation the GraphQL document against the schema and perform extra checks required for code generation.
const validateGraphQLDoc = (
  schema: graphql.GraphQLSchema,
  generalValidationSquigglyNode: TSESTree.Node,
  codeGenValidationSquigglyNode: TSESTree.Node,
  gqlOperationDocument: graphql.DocumentNode,
): { node: TSESTree.Node; messageId: MessageId; data?: Record<string, string> } | null => {
  // For some reason, graphql.validate may also throw a graphql.GraphQLError exception, rather than return it.
  // (Happens when encountering a union that includes a scalar type.)
  const exceptionOrValidationErrors = utils.catchExceptions(graphql.validate)(schema, gqlOperationDocument)
  const validationErrors = utils.isError(exceptionOrValidationErrors)
    ? [exceptionOrValidationErrors.error]
    : exceptionOrValidationErrors.value

  if (validationErrors.length > 0) {
    return {
      node: generalValidationSquigglyNode,
      messageId: 'invalidGqlLiteral',
      data: { errorMessage: validationErrors.map(graphql.printError).join('\n') },
    }
  } else {
    if (gqlOperationDocument.definitions.length > 1) {
      return { node: codeGenValidationSquigglyNode, messageId: 'noMultipleDefinitions' }
    } else {
      const gqlDefinition = gqlOperationDocument.definitions[0]

      if (gqlDefinition.kind !== 'OperationDefinition' || gqlDefinition.operation !== 'query') {
        return { node: codeGenValidationSquigglyNode, messageId: 'onlyQueryOperations' }
      }
    }
  }
  return null
}

// Helper to parse module as a TSESLint.SourceCode.Program, which requires extra properties.
const parseSourceCodeProgram = (context: RuleContext, moduleStr: string): TSESLint.SourceCode.Program => {
  // NOTE: Since ESLint parses the module source before triggering the rule, there should be a valid
  // TSESLint.ParserOptions object somewhere, but unfortunately it is not present in `context`.
  // As a workaround, we just determine `jsx` from the file extension.
  const jsx = context.getFilename().toLowerCase().endsWith('tsx')

  const prettyModuleAst = parser.parse(moduleStr, {
    ecmaFeatures: { jsx },
    loc: true,
    range: true,
    tokens: true,
    comment: true,
  })
  const loc = prettyModuleAst.loc
  const range = prettyModuleAst.range
  const tokens = prettyModuleAst.tokens
  const comments = prettyModuleAst.comments
  if (!loc || !range || !tokens || !comments) {
    throw new Error('parseSourceCodeProgram: Parsed module source missing loc, range, tokens. or comments')
  }
  return { ...prettyModuleAst, loc, range, tokens, comments }
}

// There appears to be no way to print an abstract syntax tree, so we represent the annotations as strings rather than
// AST nodes. To compare these strings while ignoring layout and redundant syntax, we format both annotations in dummy
// code fragments and compare the resulting strings. For efficiency, we don't use the (large) module source for
// formatting here. Only the inferred annotation will be formatted in the module source (in prettifyAnnotationInPlace).
const getNormalizedAnnotationStr = (str: string) => {
  const statementStr = `query${str}()`
  const normalizedStatementStr = prettier.format(statementStr, { parser: 'typescript' })

  const normalizedStatement = parser.parse(normalizedStatementStr).body[0]
  if (normalizedStatement.type === 'ExpressionStatement' && normalizedStatement.expression.type === 'CallExpression') {
    return JSON.stringify(normalizedStatement.expression.typeParameters)
  } else {
    throw new Error('getNormalizedAnnotationStr: Parsed statement has an incorrect structure.')
  }
}

// Extracts the type annotation that was inserted at the placeholder.
const extractPlaceholderTypeAnnotation = (
  PLACEHOLDER: string,
  moduleSource: TSESLint.SourceCode,
): TSESTree.TSTypeParameterInstantiation => {
  const annotatedExpression = [...eslintUtils.getNodes(moduleSource, moduleSource.ast)].find(
    (node): node is TSESTree.CallExpression =>
      (node.type === 'CallExpression' &&
        /* Function call */ ((node.callee.type === 'Identifier' && node.callee.name === PLACEHOLDER) ||
          /* Method call */ (node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'Identifier' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === PLACEHOLDER))) ||
      /* Tagged template */
      (node.type === 'TaggedTemplateExpression' && node.tag.type === 'Identifier' && node.tag.name === PLACEHOLDER),
  )

  if (!annotatedExpression) {
    throw new Error('prettifyAnnotationInPlace: Parsed module source missing annotated placeholder expression.')
  }

  const typeAnnotation = annotatedExpression.typeParameters
  if (!typeAnnotation) {
    throw new Error('prettifyAnnotationInPlace: Call expression missing type annotation.')
  }

  return typeAnnotation
}

const compareTypeAnnotations = (leftTypeAnnotationStr: string, rightTypeAnnotationStr: string): boolean =>
  getNormalizedAnnotationStr(leftTypeAnnotationStr) === getNormalizedAnnotationStr(rightTypeAnnotationStr)

// Prettify the type annotation at its destination in the full module source, and extract the prettified text to get
// the right indentation when it is applied as a quick fix.
const prettifyAnnotationInPlace = (
  context: RuleContext,
  annotationTarget: TSESTree.Identifier,
  annotationRange: [number, number],
  annotation: string,
) => {
  // To be able to extract the anotation, we replace the annotation-target identifier with a same-length placeholder
  // string that consists of '𐙀' characters from the unicode Linear A block. Note that this may fail if the module
  // already contains identifiers that consist entirely of '𐙀' characters, but in that case the module author has bigger
  // problems than a plugin exception.
  //
  // Needs to have the same length as annotationTarget for optimal layout.
  const annotationTargetLength = annotationTarget.range[1] - annotationTarget.range[0]
  const PLACEHOLDER = '𐙀'.repeat(annotationTargetLength) //https://unicode-table.com/en/10640/

  // Replace the callee property in the module source with the placeholder:
  const placeholderModuleStr =
    context.getSourceCode().text.slice(0, annotationTarget.range[0]) +
    PLACEHOLDER +
    context.getSourceCode().text.slice(annotationTarget.range[1])

  // Insert inferred type annotation in the module source with the placeholder property name, taking into account
  // that the unicode PLACEHOLDER string length is 2 * annotationTargetLength. (Prettier correctly treats it as having
  // the same width as annotationTarget.)
  const annotatedPlaceholderModuleStr =
    placeholderModuleStr.slice(0, annotationRange[0] + annotationTargetLength) + // NOTE: PLACEHOLDER is twice as long
    annotation +
    placeholderModuleStr.slice(annotationRange[1] + annotationTargetLength) // NOTE: PLACEHOLDER is twice as long

  const prettierConfig = prettier.resolveConfig.sync(context.getFilename())

  const prettyModuleStr = prettier.format(
    annotatedPlaceholderModuleStr,
    prettierConfig ? prettierConfig : { parser: 'typescript' },
  )

  const sourceCodeProgram = parseSourceCodeProgram(context, prettyModuleStr)
  const moduleSource = new TSESLint.SourceCode(prettyModuleStr, sourceCodeProgram)

  const prettyAnnotation = extractPlaceholderTypeAnnotation(PLACEHOLDER, moduleSource)

  const prettyAnnotationStr = moduleSource.text.slice(prettyAnnotation.range[0], prettyAnnotation.range[1])

  return prettyAnnotationStr
}

// Get the actual version directly from the package.json.
const version: string = require('../package.json').version

// This is not a typical ESLint rules package, as we only have a single rule.
const urlCreator = (_ruleName: string) =>
  `https://github.com/MedFlyt/eslint-plugin-graphql-type-checker/blob/v${version}/README.md`

const checkQueryTypes_RuleName = 'check-query-types'

export const rules = {
  [checkQueryTypes_RuleName]: ESLintUtils.RuleCreator(urlCreator)<RuleOptions, MessageId>({
    name: checkQueryTypes_RuleName,
    meta: {
      fixable: 'code',
      docs: {
        requiresTypeChecking: false,
        category: 'Possible Errors',
        recommended: 'error',
        description: 'Generates & validates TypeScript type annotations for GraphQL queries.',
      },
      messages,
      type: 'problem',
      schema: checkQueryTypesRuleSchema,
    },
    defaultOptions: [{ annotationTargets: [] }],
    create: checkQueryTypes_RuleListener,
  }),
}
