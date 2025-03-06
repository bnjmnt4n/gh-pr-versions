import {
  PullRequestReviewState,
  PullRequestState,
} from "./__generated__/graphql";

export {
  PullRequestQuery,
  PullRequestQueryVariables,
  PullRequestReviewState,
} from "./__generated__/graphql";

export type PullRequest = {
  number: number;
  title: string;
  state: PullRequestState;
  createdAt: string;
  author: string | null;
  isDraft: boolean;
  baseRefName: string;
  baseRefOid: string;
  headRepo: string | null;
  headRefName: string;
  headRefOid: string;
};

export type Version = {
  number: number;
  updatedAt: string;
  possibleBaseRef: { type: "ref"; ref: string } | { type: "oid"; oid: string };
  headRef: { type: "ref"; ref: string } | { type: "oid"; oid: string };
  wasInitiallyDraft: boolean;
  wasPublic: boolean;
  commentAuthors: (string | null)[];
  reviews: {
    author: string | null;
    state: PullRequestReviewState;
  }[];
};
