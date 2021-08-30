import { TSESTree, TSESLint } from '@typescript-eslint/experimental-utils'

// Copied from ts-gql package
export function* getNodes(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): Generator<TSESTree.Node, void, unknown> {
  let allVisitorKeys = sourceCode.visitorKeys
  let queue = [node]

  while (queue.length) {
    let currentNode = queue.shift()!

    yield currentNode

    let visitorKeys = allVisitorKeys[currentNode.type]
    if (!visitorKeys) continue

    for (let visitorKey of visitorKeys) {
      let child = (currentNode as any)[visitorKey] as TSESTree.Node | TSESTree.Node[] | undefined

      if (!child) {
        continue
      } else if (Array.isArray(child)) {
        queue.push(...child)
      } else {
        queue.push(child)
      }
    }
  }
}

export const getTypeDeclaration = (programAst: TSESTree.Program, queryName: string): TSESTree.TypeNode | null => {
  const decl = programAst.body.find(
    (stat): stat is TSESTree.TSTypeAliasDeclaration =>
      stat.type === 'TSTypeAliasDeclaration' && stat.id.type === 'Identifier' && stat.id.name === queryName,
  )
  return decl?.typeAnnotation ?? null // `typeAnnotation` is the right-hand side of a type alias declaration.
}
