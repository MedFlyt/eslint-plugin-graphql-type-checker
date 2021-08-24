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

type PropertyFields = ReadonlyArray<{ name: string; type: string }>

type UnionOfFields = ReadonlyArray<{
  propertyFields: PropertyFields
  condition?: graphql.GraphQLNamedType
}>

const groupByType = (unionOfFields: UnionOfFields): ReadonlyArray<PropertyFields> => {
  const groupedFields: Record<string, PropertyFields> = {}
  for (const { propertyFields, condition } of unionOfFields) {
    const typeName = condition?.name ?? '' // may seem odd, but '' is a valid object key (and cannot be a type name)
    groupedFields[typeName] = [...(groupedFields[typeName] ?? []), ...propertyFields]
  }
  return Object.values(groupedFields)
}

const emitObjectType = (unionOfFields: UnionOfFields): string => {
  const fields = groupByType(unionOfFields)
  return fields
    .map((fieldList) => '{ ' + fieldList.map(({ name, type }) => `${name}: ${type}`).join(', ') + ' }')
    .join(' | ')
}

// ArgumentsType generation:

const genArgumentsType_OperationDefinition = (
  schema: graphql.GraphQLSchema,
  operationDef: graphql.OperationDefinitionNode,
): string => {
  const variableDefinitions = operationDef.variableDefinitions ?? []

  if (variableDefinitions.length === 0) {
    return `Record<PropertyKey, never>`
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
  const operationRootType = graphql.getOperationRootType(schema, operationDef)
  return genResultType_Selections(schema, operationRootType, operationRootType.getFields(), selectionSet)
}

const genResultType_Selections = (
  schema: graphql.GraphQLSchema,
  parentType: graphql.GraphQLObjectType | graphql.GraphQLInterfaceType | graphql.GraphQLUnionType,
  fieldMap: graphql.GraphQLFieldMap<unknown, unknown>,
  selectionSet: graphql.SelectionSetNode,
): string => {
  const fieldPropertyListTypes = selectionSet.selections.flatMap(genResultType_Selection(schema, parentType, fieldMap))
  return emitObjectType(fieldPropertyListTypes)
}

const genResultType_Selection =
  (
    schema: graphql.GraphQLSchema,
    parentType: graphql.GraphQLObjectType | graphql.GraphQLInterfaceType | graphql.GraphQLUnionType,
    parentFieldMap: graphql.GraphQLFieldMap<unknown, unknown>,
  ) =>
  (selection: graphql.SelectionNode): UnionOfFields => {
    switch (selection.kind) {
      case 'Field': {
        const fieldNode: graphql.FieldNode = selection

        if (fieldNode.name.value === '__typename') {
          return [{ propertyFields: [{ name: fieldNode.name.value, type: `'${parentType.name}'` }] }]
        } else {
          const field = parentFieldMap[fieldNode.name.value]
          const fieldType = field.type
          const namedType: graphql.GraphQLNamedType = graphql.getNamedType(fieldType)
          const typeModifierWrapper = getTypeModifierWrapper(fieldType)

          let tsBaseType: string
          const selectionSet = fieldNode.selectionSet
          if (selectionSet) {
            // TODO: Refactor
            if (namedType instanceof graphql.GraphQLObjectType || namedType instanceof graphql.GraphQLInterfaceType) {
              tsBaseType = genResultType_Selections(schema, namedType, namedType.getFields(), selectionSet)
            } else if (namedType instanceof graphql.GraphQLUnionType) {
              const unionType: graphql.GraphQLUnionType = namedType
              tsBaseType = genResultType_Selections(schema, unionType, parentFieldMap, selectionSet)
            } else {
              throw new Error(
                `genResultType_Selection: Encountered selectionSet at field ${fieldNode.name.value},` +
                  ` with non-object type ${namedType.name}.`,
              )
            }
          } else {
            tsBaseType = convertScalars(namedType.name)
          }
          return [
            {
              propertyFields: [
                {
                  name: fieldNode.name.value,
                  type: typeModifierWrapper(tsBaseType),
                },
              ],
            },
          ]
        }
      }
      case 'FragmentSpread': {
        // Fragments cannot be declared in a schema, so we can't support them currently as only single operations are allowed.
        // Allowing optional fragments besides the operation would be easy, but not very useful unless there's a way to
        // share fragments between queries.
        throw new Error('genResultType_Selection: Unsupported SelectionNode: FragmentSpreadNode')
      }
      case 'InlineFragment': {
        const inlineFragment: graphql.InlineFragmentNode = selection
        let conditionOrParentType: graphql.GraphQLObjectType | graphql.GraphQLInterfaceType | graphql.GraphQLUnionType

        let fieldMap: graphql.GraphQLFieldMap<unknown, unknown>

        if (inlineFragment.typeCondition === undefined) {
          // The type condition is undefined, for `... { FIELDS }` fragments (which are redundant and can be
          // replaced with just `FIIELDS`).
          conditionOrParentType = parentType
          fieldMap = parentFieldMap
        } else {
          const conditionType = typeFromAst(schema, inlineFragment.typeCondition)

          if (conditionType === undefined) {
            // Should never happen because of validation.
            throw new Error('genResultType_Selection: Undefined type condition')
          }
          if (!(conditionType instanceof graphql.GraphQLObjectType)) {
            // TODO: Can we have list & non-null here?
            throw new Error('genResultType_Selection: Condition type not an object type')
          }
          conditionOrParentType = conditionType
          fieldMap = conditionType.getFields()
        }
        const inlineSelectionSet = inlineFragment.selectionSet

        return graphql.isTypeSubTypeOf(schema, conditionOrParentType, parentType)
          ? inlineSelectionSet.selections
              .flatMap(genResultType_Selection(schema, conditionOrParentType, fieldMap))
              .map(({ propertyFields, condition }) => ({
                propertyFields,
                // For fields without conditions, use conditionOrParentType.
                condition: condition ?? conditionOrParentType,
              }))
          : []
      }
    }
  }

// Main:

export const generateTypes = (
  schema: graphql.GraphQLSchema,
  document: graphql.DocumentNode,
): { argumentsType: string; resultType: string } => {
  if (document.definitions.length === 1 && document.definitions[0].kind === 'OperationDefinition') {
    const argumentsType = genArgumentsType_OperationDefinition(schema, document.definitions[0])
    const resultType = genResultType_OperationDefinition(schema, document.definitions[0])

    return { argumentsType, resultType }
  } else {
    throw new Error('generateTypes: Not a single operation definition')
  }
}
