#!/usr/bin/env node
import { getPullRequestInformation } from "../src/getPullRequestInformation";
import { PullRequest, PullRequestReviewState, Version } from "../src/types";
import { execute, pluralize, unique } from "../src/utils";

function getRepository(input: string) {
  if (!input.includes("/") || /\s/.test(input)) return null;
  const [owner, name] = input.split("/");
  if (!owner || !name) return null;
  return {
    owner,
    name,
    nameWithOwner: input,
  };
}

function usage() {
  console.error(
    `
gh-pr-versions list|fetch|clear

gh-pr-versions requires the \`gh\` and \`git\` binaries to be installed and
functional.

Commands:
    gh-pr-versions list <PULL_REQUEST_NUMBER>

        List versions of a pull request.

    gh-pr-versions fetch <PULL_REQUEST_NUMBER> [VERSIONS...]

        Fetch versions of a pull request into local branches titled
        "pulls/[PULL_REQUEST_NUMBER]/v1", "pulls/[PULL_REQUEST_NUMBER]/v2", etc.
        Also fetches the base of the pull request into
        "pulls/[PULL_REQUEST_NUMBER]/base" and the latest version of the pull
        request into "pulls/[PULL_REQUEST_NUMBER]/latest".

        If versions are provided, only the given versions are fetched.
        Otherwise, all versions are fetched.

    gh-pr-versions clear <PULL_REQUEST_NUMBER>

        Clear versions of a pull request which were fetched into local branches.
`.trim(),
  );
}

function listVersions(versions: Version[]) {
  const versionsLength = String(versions.at(-1)?.number ?? 0).length;
  for (const version of versions) {
    const versionString = `v${version.number}`.padStart(versionsLength + 1);
    const baseRefString =
      version.possibleBaseRef.type === "ref"
        ? version.possibleBaseRef.ref
        : version.possibleBaseRef.oid.slice(0, 12);
    const headRefString =
      version.headRef.type === "ref"
        ? version.headRef.ref
        : version.headRef.oid.slice(0, 12);

    const metadata = [
      version.wasInitiallyDraft && !version.wasPublic ? "draft" : null,
      version.reviews.length > 0
        ? (() => {
            const reviews = version.reviews.reduce(
              (acc, review) => {
                if (!acc[review.state]) acc[review.state] = [];
                acc[review.state].push(review.author ?? "(unknown)");
                return acc;
              },
              {} as Record<PullRequestReviewState, string[]>,
            );
            const reviewDisplayNameMap = {
              APPROVED: "approval",
              CHANGES_REQUESTED: "change request",
              COMMENTED: "review",
              PENDING: "pending review",
              DISMISSED: "dismissed review",
            } satisfies Record<PullRequestReviewState, string>;

            return Object.entries(reviewDisplayNameMap)
              .map(([_state, displayName]) => {
                const state = _state as PullRequestReviewState;
                if (reviews[state]) {
                  return `${pluralize(reviews[state].length, displayName)} by ${unique(reviews[state]).join("; ")}`;
                }
              })
              .filter((x) => x)
              .join(", ");
          })()
        : null,
      version.commentAuthors.length > 0
        ? `${pluralize(version.commentAuthors.length, "comment")} by ${unique(version.commentAuthors.map((author) => author ?? "(unknown)")).join(", ")}`
        : null,
    ]
      .filter((x) => x)
      .join("; ");

    console.log(
      `    ${versionString} (${version.updatedAt}): ${baseRefString}..${headRefString}${metadata ? ` (${metadata})` : ""}`,
    );
  }
}

const REF_PREFIX = "refs/heads/pulls";

function fetchVersions(
  pullRequest: PullRequest,
  versions: Version[],
  versionsToFetch: string[],
) {
  const versionsToFetchSet = new Set(versionsToFetch);
  const shouldFetchBase =
    versionsToFetchSet.has("base") || versionsToFetchSet.size === 0;
  const shouldFetchLatest =
    versionsToFetchSet.has("latest") || versionsToFetchSet.size === 0;
  const lastVersion = versions.at(-1);

  const versionsWithRefspec = versions.map((version) => {
    if (version.headRef.type === "ref") {
      throw new Error(
        "Invariant error: versions passed to fetchVersion must have a head ref OID",
      );
    }
    const name = `v${version.number}`;
    return {
      name,
      refspec: `+${version.headRef.oid}:${REF_PREFIX}/${pullRequest.number}/${name}`,
      version,
    };
  });

  const fetchedVersionsWithRefspec = versionsWithRefspec.filter(
    (version) =>
      versionsToFetchSet.size === 0 || versionsToFetchSet.has(version.name),
  );
  const otherRefspecs = [];
  const contentBeingFetched = [];

  if (fetchedVersionsWithRefspec.length > 0) {
    contentBeingFetched.push(
      pluralize(fetchedVersionsWithRefspec.length, "version"),
    );
  }

  if (shouldFetchBase) {
    contentBeingFetched.push("base");
    otherRefspecs.push(
      `+${pullRequest.baseRefOid}:${REF_PREFIX}/${pullRequest.number}/base`,
    );
  }

  if (shouldFetchLatest && lastVersion?.headRef.type === "oid") {
    contentBeingFetched.push("latest");
    otherRefspecs.push(
      `+${lastVersion.headRef.oid}:${REF_PREFIX}/${pullRequest.number}/latest`,
    );
  }

  console.log(`Fetching ${contentBeingFetched.join(", ")} with Git:`);
  const output = execute("git", [
    "fetch",
    "origin",
    ...fetchedVersionsWithRefspec.map((version) => version.refspec),
    ...otherRefspecs,
  ]);
  console.log(output.stderr || "No output from git command");
  console.log();
  listVersions(
    fetchedVersionsWithRefspec.map((version) => ({
      ...version.version,
      headRef: {
        type: "ref",
        ref: `${REF_PREFIX}/${pullRequest.number}/${version.name}`.replace(
          /^refs\/heads\//,
          "",
        ),
      },
    })),
  );
}

function clearVersions(
  repositoryNameWithOwner: string,
  pullRequestNumber: number,
) {
  const output = execute("git", [
    "for-each-ref",
    "--format",
    "%(refname)",
    `${REF_PREFIX}/${pullRequestNumber}/*`,
  ]);
  const refs = output.stdout.split(/\r?\n/).filter(Boolean);
  for (const ref of refs) {
    execute("git", ["update-ref", "-d", ref]);
  }
  console.log(
    `Removed ${refs.length} branches of ${repositoryNameWithOwner}#${pullRequestNumber}`,
  );
}

function getPullRequestInformationOrExit(options: {
  repository: NonNullable<ReturnType<typeof getRepository>>;
  pullRequestNumber: number;
}) {
  const pullRequestLabel = `${options.repository.nameWithOwner}#${options.pullRequestNumber}`;
  const pullRequestInformation = getPullRequestInformation({
    owner: options.repository.owner,
    name: options.repository.name,
    pullRequestNumber: options.pullRequestNumber,
  });
  if (pullRequestInformation.errors) {
    console.error(
      `Encountered the following errors when fetching data for ${pullRequestLabel}: ${JSON.stringify(pullRequestInformation.errors, null, 2)}`,
    );
    process.exit(1);
  }
  if (pullRequestInformation.data === null) {
    console.error(`Could not fetch data for ${pullRequestLabel}`);
    process.exit(1);
  }
  return pullRequestInformation.data;
}

function printPullRequestInformation(
  repository: NonNullable<ReturnType<typeof getRepository>>,
  pullRequestInformation: ReturnType<typeof getPullRequestInformationOrExit>,
) {
  const { pullRequest, versions, timelineItems } = pullRequestInformation;
  const pullRequestLabel = `${repository.nameWithOwner}#${pullRequest.number}`;
  const state =
    pullRequest.state.slice(0, 1).toUpperCase() +
    pullRequest.state.slice(1).toLowerCase();
  console.log(
    `${pullRequest.title} • ${pullRequestLabel} by ${pullRequest.author ?? "(unknown)"}`,
  );
  console.log(
    `${state} • ${pullRequest.baseRefName} <- ${pullRequest.headRepo !== repository.nameWithOwner ? `${pullRequest.headRepo ?? "(unknown)"}:` : ""}${pullRequest.headRefName}`,
  );
  console.log();

  if (process.env.DEBUG) {
    console.log(`Printing debug output:`);
    console.log();
    console.log(
      `Timeline items: ${JSON.stringify(timelineItems.slice().reverse(), null, 2)}`,
    );
    console.log();
    console.log(`Versions: ${JSON.stringify(versions, null, 2)}`);
    console.log();
  }
}

function main() {
  const command = process.argv[2];
  const pullRequestNumber = Number.parseInt(process.argv[3] ?? "");
  if (
    (command !== "list" &&
      command !== "fetch" &&
      command !== "clear" &&
      command !== "help") ||
    !pullRequestNumber
  ) {
    usage();
    process.exit(1);
  }
  if (command === "help") {
    usage();
    return;
  }

  const repoCommand = execute("gh", ["repo", "set-default", "--view"]);
  const repository = getRepository(repoCommand.stdout);
  if (!repository) {
    console.error("Could not determine current repository");
    console.error(
      "Please run `gh repo set-default` to set the current repository",
    );
    process.exit(1);
  }

  switch (command) {
    case "list": {
      const pullRequestInformation = getPullRequestInformationOrExit({
        repository,
        pullRequestNumber,
      });
      printPullRequestInformation(repository, pullRequestInformation);
      listVersions(pullRequestInformation.versions);
      return;
    }
    case "fetch": {
      const versionsToFetch = process.argv
        .slice(4)
        .map((version) => (/^\d+$/.test(version) ? `v${version}` : version));
      const pullRequestInformation = getPullRequestInformationOrExit({
        repository,
        pullRequestNumber,
      });
      printPullRequestInformation(repository, pullRequestInformation);
      fetchVersions(
        pullRequestInformation.pullRequest,
        pullRequestInformation.versions,
        versionsToFetch,
      );
      return;
    }
    case "clear": {
      clearVersions(repository.nameWithOwner, pullRequestNumber);
      return;
    }
  }
}

main();
