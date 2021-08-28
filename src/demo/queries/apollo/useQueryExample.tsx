import { gql, useQuery } from "@apollo/client";
import React from "react";

export const App = () => {
  // useQuery is annotated by the plugin.
  const { data } = useQuery<
    { greeting: { __typename: "Greeting"; message: string } },
    { language: string }
  >(
    gql`
      query GetGreeting($language: String!) {
        greeting(language: $language) {
          __typename
          message
        }
      }
    `,
    {
      variables: { language: "english" }, // Strongly-typed variables
    },
  );

  // inferred type for data: { greeting: { __typename: "Greeting", message: string } } | undefined
  return <div className="App">{data && data.greeting.message}!</div>;
};
