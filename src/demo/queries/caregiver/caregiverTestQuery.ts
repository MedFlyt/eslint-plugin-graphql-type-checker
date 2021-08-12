import * as graphql from "graphql";
import gql from "graphql-tag";

type TrainingCenterBundleId = string;
type CaregiverId = string;
type AgencyId = string;
type LocalDate = Date;

type Agency = {
    name: string;
    website: string;
};

const CaregiverGraphQL = {
    query<Args, Res>(_conn: any, _gqlDoc: graphql.DocumentNode, _args: Args): Res {
        return {} as any;
    },
};

const conn = undefined;

export const test = async () =>
    CaregiverGraphQL.query<
        { bundleId: TrainingCenterBundleId },
        {
            visibleTrainingCenterBundles: ReadonlyArray<{
                caregiver_id: CaregiverId;
                agency_id: AgencyId;
                caregiver_visible_date: LocalDate;
                agency: { name: string; website: string };
            }>;
        }
    >(
        conn,
        gql`
            query ($bundleId: TrainingCenterBundleId!) {
                visibleTrainingCenterBundles(bundle_id: { eq: $bundleId }) {
                    caregiver_id
                    agency_id
                    caregiver_visible_date
                    agency {
                        name
                        website
                    }
                }
            }
        `,
        {
            bundleId: "42",
        },
    );