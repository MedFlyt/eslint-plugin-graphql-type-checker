import * as graphql from 'graphql'
import gql from 'graphql-tag'

type AgencyMemberId = string

type AgencyMemberId_Filter = {
  eq?: AgencyMemberId
  in: [AgencyMemberId]
}

const AgencyMemberGraphQL = {
  query<Res, Args>(_conf: any, _gqlQuery: graphql.DocumentNode, _args: Args): Promise<Res> {
    return {} as any
  },
}

const conn = undefined

export const test = async () =>
  AgencyMemberGraphQL.query<
    {
      agencyMembers: ReadonlyArray<{
        id: AgencyMemberId
        firstName: string
        agency: { website: string }
      }>
    },
    { memberName: string; id: AgencyMemberId_Filter | null }
  >(
    conn,
    gql`
      query ($memberName: String!, $id: AgencyMemberId_Filter) {
        agencyMembers(nameSearch: $memberName, id: $id) {
          id
          firstName
          agency {
            website
          }
        }
      }
    `,
    {
      memberName: 'Bob Ross',
      id: { in: ['42'] },
    },
  )
