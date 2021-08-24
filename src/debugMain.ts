import * as graphql from 'graphql'
import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'

import * as codeGenerator from './codeGenerator'
import * as utils from './utils'

// Dummy main module to run the code generator outside ESLint, to be used for debugging.

const schemaFilePath = path.join(__dirname, '../src/schemas/debug-schema.graphql')

// Dummy tagged template to enable GraphQL plugin on gql`...` strings.
const gql = ([literal]: TemplateStringsArray): string => literal

const gqlStr = gql`
  query ($bundleId: TrainingCenterBundleId!) {
    visibleTrainingCenterBundles(bundle_id: $bundleId) {
      caregiver_id
      agency_id
      caregiver_visible_date
      agency {
        # name # Common fields can be used only on interfaces, not on unions. Interfaces are a kind of union.
        # TODO: Using name on a union type is not caught by graphql.validate, as apparently FieldsOnCorrectTypeRule is not triggered.
        # It is only detected by the VSCode plugin.
        # WEIRD: apparently now it does trigger a validation error..
        ... {
          __typename
          # streetAddress
          ... on PhysicalAgency {
            __typename
            streetAddress
          }
        }
        ... on OnlineAgency {
          __typename
          website
        }
      }
    }
  }
`

const main = () => {
  console.log(`Generating types for schema file '${schemaFilePath}' and operation:\n${gqlStr.trim()}\n`)

  const absoluteSchemaFilePath = path.resolve(schemaFilePath)
  const schemaFileContentsResult = readSchema(absoluteSchemaFilePath)
  if (utils.isError(schemaFileContentsResult)) {
    console.error(schemaFileContentsResult.error)
  } else {
    const schemaFileContents = schemaFileContentsResult.value
    const schemaResult = utils.catchExceptions(graphql.buildSchema)(schemaFileContents)

    if (utils.isError(schemaResult)) {
      console.error(schemaResult.error)
    } else {
      const schema = schemaResult.value
      {
        const res = utils.catchExceptions(graphql.parse)(gqlStr)
        if (utils.isError(res)) {
          console.error(res.error.message)
        } else {
          const gqlOperationDocument = res.value

          const exceptionOrValidationErrors = utils.catchExceptions(graphql.validate)(
            schema,
            gqlOperationDocument,
            graphql.specifiedRules, // TODO: Probably not necessary, should be the default.
          )
          const validationErrors = utils.isError(exceptionOrValidationErrors)
            ? [exceptionOrValidationErrors.error]
            : exceptionOrValidationErrors.value
          if (validationErrors.length > 0) {
            const errorMessage = validationErrors.map(graphql.printError).join('\n')
            console.error(errorMessage)
          } else {
            const { argumentsType, resultType } = codeGenerator.generateTypes(schema, gqlOperationDocument)
            const inferredDeclarations = `type QueryResult = ${resultType}\n` + `type QueryArguments = ${argumentsType}`

            const prettierConfig = prettier.resolveConfig.sync(path.join(__dirname, '../.prettierrc'))

            const prettyModuleStr = prettier.format(
              inferredDeclarations,
              prettierConfig ? prettierConfig : { parser: 'typescript' },
            )

            console.log(`\nInferred types:\n\n${prettyModuleStr}`)
          }
        }
      }
    }
  }
}

const readSchema = (schemaFilePath: string): utils.ValueOrError<string, string> => {
  try {
    return { value: fs.readFileSync(schemaFilePath, 'utf8') }
  } catch (error) {
    return { error }
  }
}

main()
