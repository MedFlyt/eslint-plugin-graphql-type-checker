import * as graphql from "graphql";
import gql from "graphql-tag";

type AgencyMemberId = string;

type AgencyMemberId_Filter = {
    eq?: AgencyMemberId;
    in: [AgencyMemberId];
};

const AgencyMemberGraphQL = {
    query<Args, Res>(_conn: any, _gqlDoc: graphql.DocumentNode, _args: Args): Res {
        return {} as any;
    },
};

const conn = undefined;

export const test = async () =>
    AgencyMemberGraphQL.query<
        { memberName: string; id: AgencyMemberId_Filter | null },
        {
            agencyMembers: ReadonlyArray<{
                id: AgencyMemberId;
                firstName: string;
                agency: { website: string };
            }>;
        }
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
            memberName: "Bob Ross",
            id: { in: ["42"] },
        },
    );