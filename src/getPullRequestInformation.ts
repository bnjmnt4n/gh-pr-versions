import { readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { execute } from "./utils";

import type {
  PullRequestQueryVariables,
  PullRequestQuery,
  PullRequest,
  Version,
} from "./types";

type ResultType<TResult> =
  | { data: TResult }
  | { errors: { message: string }[] };

function executePullRequestQuery(variables: PullRequestQueryVariables) {
  const query = readFileSync(
    pathJoin(__dirname, "../resources/pull_request.graphql"),
    {
      encoding: "utf8",
    },
  ).trim();
  const variablesArgs = Object.entries(variables).flatMap(([name, value]) => [
    "-F",
    `${name}=${String(value)}`,
  ]);
  const output = execute("gh", [
    "api",
    "graphql",
    "--paginate",
    "--slurp",
    ...variablesArgs,
    "-f",
    `query=${query}`,
  ]).stdout;
  return JSON.parse(output) as
    | ResultType<PullRequestQuery>
    | ResultType<PullRequestQuery>[];
}

export function getPullRequestInformation(options: {
  owner: string;
  name: string;
  pullRequestNumber: number;
}) {
  const queryResult = executePullRequestQuery(options);
  const queryResultPages = Array.isArray(queryResult)
    ? queryResult
    : [queryResult];
  const pages = [];
  const errors = [];

  for (const result of queryResultPages) {
    if ("errors" in result) {
      errors.push(...result.errors);
    } else {
      pages.push(result.data);
    }
  }
  if (errors.length) {
    return { errors };
  }

  const pullRequestData = pages[0]?.repository?.pullRequest;
  if (!pullRequestData) {
    return { data: null };
  }

  const pullRequest: PullRequest = {
    number: pullRequestData.number,
    title: pullRequestData.title,
    state: pullRequestData.state,
    createdAt: pullRequestData.createdAt,
    author: pullRequestData.author?.login ?? null,
    isDraft: pullRequestData.isDraft,
    baseRefName: pullRequestData.baseRefName,
    baseRefOid: pullRequestData.baseRefOid,
    headRepo: pullRequestData.headRepository?.nameWithOwner ?? null,
    headRefName: pullRequestData.headRefName,
    headRefOid: pullRequestData.headRefOid,
  };

  const versions: Omit<Version, "number">[] = [
    {
      possibleBaseRef: { type: "oid", oid: pullRequest.baseRefOid },
      headRef: { type: "oid", oid: pullRequest.headRefOid },
      wasInitiallyDraft: pullRequest.isDraft,
      wasPublic: !pullRequest.isDraft,
      commentAuthors: [],
      reviews: [],
      // Will be populated during the relevant timeline event.
      updatedAt: "",
    },
  ];

  // Collate timeline items in reverse chronological order.
  const timelineItems = pages
    .flatMap((page) => page.repository?.pullRequest?.timelineItems.nodes ?? [])
    .filter((item) => !!item)
    .reverse();

  let hasSeenPullRequestCommitTimelineItem = false;

  for (const [index, timelineItem] of timelineItems.entries()) {
    const currentVersion = versions[0];
    if (!currentVersion)
      throw new Error("Invariant error: there must always be a version");

    switch (timelineItem.__typename) {
      // Force pushing is always a new version.
      case "HeadRefForcePushedEvent": {
        if (!timelineItem.beforeCommit) break;
        currentVersion.updatedAt = timelineItem.createdAt;
        versions.unshift({
          // Always use a ref instead of OID, because OIDs might not exist
          // at the time of the event.
          possibleBaseRef:
            currentVersion.possibleBaseRef.type === "ref"
              ? currentVersion.possibleBaseRef
              : { type: "ref", ref: pullRequest.baseRefName },
          headRef: { type: "oid", oid: timelineItem.beforeCommit.oid },
          wasInitiallyDraft: currentVersion.wasInitiallyDraft,
          wasPublic: !currentVersion.wasInitiallyDraft,
          commentAuthors: [],
          reviews: [],
          // Note: this is a heuristic, and not completely accurate.
          updatedAt: timelineItem.beforeCommit.committedDate,
        });
        break;
      }

      // When the PR's base ref is changed, we mark it as a new version.
      // However, the event does not provide the OID of the ref's commit,
      // so we have to use the old ref's name.
      case "BaseRefChangedEvent": {
        currentVersion.updatedAt = timelineItem.createdAt;
        versions.unshift({
          possibleBaseRef: { type: "ref", ref: timelineItem.previousRefName },
          headRef: currentVersion.headRef,
          wasInitiallyDraft: currentVersion.wasInitiallyDraft,
          wasPublic: !currentVersion.wasInitiallyDraft,
          commentAuthors: [],
          reviews: [],
          // TODO: accurate?
          updatedAt: "",
        });
        break;
      }
      // TODO
      case "BaseRefForcePushedEvent": {
        break;
      }

      // If the base changed automatically, it means the branch was deleted.
      // Therefore there isn't any point? trying to update the version to match
      // the old branch name, which is now non-existent.
      case "AutomaticBaseChangeSucceededEvent": {
        break;
      }

      // For reviews and comments, we just track the author and state.
      // TODO: capture URLs to link to them directly?
      case "PullRequestReview": {
        currentVersion.reviews.unshift({
          author: timelineItem.author?.login ?? null,
          state: timelineItem.state,
        });
        break;
      }
      case "IssueComment": {
        currentVersion.commentAuthors.unshift(
          timelineItem.author?.login ?? null,
        );
        break;
      }

      // We only care about the initial draft state of the PR (to propagate the
      // state to the previous version), and whether the PR was public at any
      // point.
      case "ConvertToDraftEvent": {
        currentVersion.wasPublic = true;
        currentVersion.wasInitiallyDraft = false;
        break;
      }
      case "ReadyForReviewEvent": {
        currentVersion.wasPublic = true;
        currentVersion.wasInitiallyDraft = true;
        break;
      }

      // PullRequestCommit items are typically grouped together.
      // If there is a previous item which is not a PullRequestCommit or HeadRefForcePushedEvent,
      // then there was a gap between pushing commits in which other events occurred,
      // which can be used as an indicator of a new version.
      case "PullRequestCommit": {
        if (
          !currentVersion.updatedAt &&
          currentVersion.headRef.type === "oid" &&
          currentVersion.headRef.oid === timelineItem.commit.oid
        ) {
          currentVersion.updatedAt = timelineItem.commit.committedDate;
        }
        const previousItem = timelineItems[index - 1];
        if (
          hasSeenPullRequestCommitTimelineItem &&
          previousItem &&
          previousItem.__typename !== "PullRequestCommit" &&
          previousItem.__typename !== "HeadRefForcePushedEvent"
        ) {
          versions.unshift({
            possibleBaseRef: currentVersion.possibleBaseRef,
            headRef: { type: "oid", oid: timelineItem.commit.oid },
            wasInitiallyDraft: currentVersion.wasInitiallyDraft,
            wasPublic: !currentVersion.wasInitiallyDraft,
            commentAuthors: [],
            reviews: [],
            updatedAt: timelineItem.commit.committedDate,
          });
        }
        hasSeenPullRequestCommitTimelineItem = true;
        break;
      }

      // No handling required for other events.
      default:
        continue;
    }
  }

  // Set the updated time of the initial version to the PR's creation time.
  if (versions[0]) versions[0].updatedAt = pullRequest.createdAt;

  return {
    data: {
      pullRequest,
      versions: versions.map((version, index) => ({
        ...version,
        number: index + 1,
      })),
      timelineItems,
    },
  };
}
