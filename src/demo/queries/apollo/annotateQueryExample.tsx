import Apollo, { gql, useQuery } from "@apollo/client";
import React from "react";

// Helper identity function that converts untyped DocumentNodes to TypedDocumentNodes, and that can be
// targeted by the plugin.
const annotateQuery = <TData, TVariables>(
  gql: Apollo.DocumentNode,
): Apollo.TypedDocumentNode<TData, TVariables> => gql;

// Typed query that is annotated by the plugin.
const greetingQuery = annotateQuery<
  { greeting: { __typename: "Greeting"; message: string } },
  { language: string }
>(gql`
  query GetGreeting($language: String!) {
    greeting(language: $language) {
      __typename
      message
    }
  }
`);

export const App = () => {
  const { data } = useQuery(greetingQuery, {
    variables: { language: "english" }, // Strongly-typed variables
  });

  // inferred type for data: { greeting: { __typename: "Greeting", message: string } } | undefined
  return <div className="App">{data && data.greeting.message}!</div>;
};
