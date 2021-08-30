import * as graphql from 'graphql'
import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'

import * as codeGenerator from './codeGenerator'
import * as utils from './utils'

// Dummy main module to run the code generator outside ESLint, to be used for debugging.

const schemaFilePath = path.join(__dirname, '../src/schemas/apollo-schema.graphql')

const gqlStr = `
query GetGreeting($language: String!) {
    greeting(language: $language) {
        __typename
        message
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

          const exceptionOrValidationErrors = utils.catchExceptions(graphql.validate)(schema, gqlOperationDocument)
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
