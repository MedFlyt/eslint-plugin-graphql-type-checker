import Apollo, { gql, useQuery } from '@apollo/client'
import React from 'react'

// Typed tagged template that returns a TypedDocumentNode, and that can be targeted by the plugin.
// The GraphQL VSCode extension only triggers on gql`..`, but it can be activated by adding a
// comment: tgql`#grapql ..`. Renaming tgql to gql won't work as the extension won't trigger on generic
// gql<..>`..` expressions.
const tgql = function <TData = Record<string, any>, TVariables = Record<string, any>>(
  literals: string | readonly string[],
  ...args: any[]
): Apollo.TypedDocumentNode<TData, TVariables> {
  return gql(literals, ...args)
}

// Typed tagged template that is annotated by the plugin.
const greetingQuery = tgql<{ greeting: { __typename: 'Greeting'; message: string } }, { language: string }>`#graphql
  query GetGreeting($language: String!) {
    greeting(language: $language) {
      __typename
      message
    }
  }
`

export const App = () => {
  const { data } = useQuery(greetingQuery, {
    variables: { language: 'english' }, // Strongly-typed variables
  })

  // inferred type for data: { greeting: { __typename: "Greeting", message: string } } | undefined
  return <div className="App">{data && data.greeting.message}!</div>
}
