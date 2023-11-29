import * as graphql from 'graphql'

// Utils:

const scalarTypes: Record<string, string> = {
  ID: 'string',
  String: 'string',
  Boolean: 'boolean',
  Int: 'number',
  Float: 'number',
}

const convertScalars = (typeName: string): string => scalarTypes[typeName] ?? typeName

const wrapListModifier = (tsType: string): string => `ReadonlyArray<${tsType}>`
const wrapOrNullModifier = (tsType: string): string => `${tsType} | null`

const getTypeModifierWrapper = (
  gqlType: graphql.GraphQLType,
  isNonNull: boolean = false,
): ((typeName: string) => string) =>
  graphql.isNonNullType(gqlType)
    ? getTypeModifierWrapper(gqlType.ofType, true)
    : (tsType) => {
        const wrappedType = graphql.isListType(gqlType)
          ? wrapListModifier(getTypeModifierWrapper(gqlType.ofType, false)(tsType))
          : tsType

        return isNonNull ? wrappedType : wrapOrNullModifier(wrappedType)
      }

// Helper to deal with union-argument to overloaded function (see https://github.com/microsoft/TypeScript/issues/14107).
const typeFromAst = (
  schema: graphql.GraphQLSchema,
  typeNode: graphql.TypeNode,
): graphql.GraphQLNonNull<any> | graphql.GraphQLList<any> | graphql.GraphQLNamedType | undefined =>
  typeNode.kind === 'ListType'
    ? graphql.typeFromAST(schema, typeNode)
    : typeNode.kind === 'NonNullType'
      ? graphql.typeFromAST(schema, typeNode)
      : graphql.typeFromAST(schema, typeNode)

// ArgumentsType generation:

export const EMPTY_OBJECT_TYPE = 'Record<PropertyKey, never>'

const genArgumentsType_OperationDefinition = (
  schema: graphql.GraphQLSchema,
  operationDef: graphql.OperationDefinitionNode,
): string => {
  const variableDefinitions = operationDef.variableDefinitions ?? []

  if (variableDefinitions.length === 0) {
    return EMPTY_OBJECT_TYPE
  }

  const variableDefinitionsStr = variableDefinitions.map(genArgumentsType_VariableDefinition(schema)).join(', ')
  return `{ ${variableDefinitionsStr} }`
}

const genArgumentsType_VariableDefinition =
  (schema: graphql.GraphQLSchema) =>
  (variableDef: graphql.VariableDefinitionNode): string => {
    const variableType = genArgumentsType_Type(schema, variableDef.type)
    return `${variableDef.variable.name.value}: ${variableType}`
  }

const genArgumentsType_Type = (schema: graphql.GraphQLSchema, typeNode: graphql.TypeNode): string => {
  const gqlType = typeFromAst(schema, typeNode)
  if (gqlType) {
    const typeModifierWrapper = getTypeModifierWrapper(gqlType)
    const tsBaseType = convertScalars(graphql.getNamedType(gqlType).name)

    return typeModifierWrapper(tsBaseType)
  } else {
    throw new Error('genArgumentsType_Type: Invalid type node.')
  }
}

// ResultType generation:

const genResultType_OperationDefinition = (
  schema: graphql.GraphQLSchema,
  operationDef: graphql.OperationDefinitionNode,
): string => {
  const selectionSet = operationDef.selectionSet
  const fieldPropertyListTypes = selectionSet.selections
    .map(genResultType_Selection(schema, graphql.getOperationRootType(schema, operationDef)))
    .join(', ')
  return `{ ${fieldPropertyListTypes} }`
}

const genResultType_Selection =
  (schema: graphql.GraphQLSchema, parentType: graphql.GraphQLObjectType) =>
  (selection: graphql.SelectionNode): string => {
    switch (selection.kind) {
      case graphql.Kind.FIELD: {
        const fieldNode: graphql.FieldNode = selection

        if (fieldNode.name.value === '__typename') {
          // TODO: not sure how this holds on union types and others.
          return `${fieldNode.name.value}: '${parentType.name}'`
        } else {
          const parentFieldMap: graphql.GraphQLFieldMap<any, any> = parentType.getFields()
          const field = parentFieldMap[fieldNode.name.value]
          const fieldType = field.type
          const namedType: graphql.GraphQLNamedType = graphql.getNamedType(fieldType)
          const typeModifierWrapper = getTypeModifierWrapper(fieldType)

          let tsBaseType: string
          if (fieldNode.selectionSet) {
            if (!(namedType instanceof graphql.GraphQLObjectType)) {
              throw new Error('genResultType_Selection: Encountered selectionSet on non-object field.')
            } else {
              tsBaseType = `{${fieldNode.selectionSet.selections
                .map(genResultType_Selection(schema, namedType))
                .join(', ')}}`
            }
          } else {
            tsBaseType = convertScalars(namedType.name)
          }
          return `${fieldNode.name.value}: ${typeModifierWrapper(tsBaseType)}`
        }
      }
      case graphql.Kind.FRAGMENT_SPREAD: {
        throw new Error('genResultType_Selection: Unsupported SelectionNode: FragmentSpreadNode')
      }
      case graphql.Kind.INLINE_FRAGMENT: {
        throw new Error('genResultType_SelectiongenResultType_Selection: Unsupported SelectionNode: InlineFragmentNode')
      }
    }
  }

// Main:

export const generateTypes = (params: {
  schema: graphql.GraphQLSchema
  document: graphql.DocumentNode
}): { argumentsType: string; resultType: string } => {
  const { schema, document } = params

  if (document.definitions.length === 1 && document.definitions[0].kind === 'OperationDefinition') {
    const argumentsType = genArgumentsType_OperationDefinition(schema, document.definitions[0])
    const resultType = genResultType_OperationDefinition(schema, document.definitions[0])

    return { argumentsType, resultType }
  } else {
    throw new Error('generateTypes: Not a single operation definition')
  }
}
