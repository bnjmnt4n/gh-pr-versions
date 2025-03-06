# gh-pr-versions

List and fetch versions of a GitHub pull request.

## Why

[Patch-based code review][interdiff] is popular in various open-source projects, including Linux, Git, and many others. However, GitHub—the largest code forge—[doesn't cater well][github-diff-soup] to [patch-based code review][github-changesets].

There are external services which allow some form of patch-based code review for GitHub, including [Butler Review][butler-review] and [Graphite][graphite]. However, these are both external tools which can't be used as-is on existing GitHub repositories, and require organizational buy-in.

`gh-pr-versions` adds some tooling to improve the process for performing patch-based code reviews on GitHub. It labels each set of commits force-pushed to a Pull Request with a version number, and allows versions to be fetched locally. This allows Git-native tools like [`git range-diff`][git-range-diff] to be used to understand the evolution of the Pull Request.

## Usage

### Installation

`gh-pr-versions` is available from the npm package registry.

To install the binary globally:

```sh
npm i -g gh-pr-versions
gh-pr-versions
```

To run the command without installing it globally:

```sh
npx gh-pr-versions
```

`gh-pr-versions` requires the `gh` and `git` binaries to be installed and functional.

### Commands

- `gh-pr-versions list <PULL_REQUEST_NUMBER>`
  List versions of a pull request.
- `gh-pr-versions fetch <PULL_REQUEST_NUMBER> [VERSIONS...]`
  Fetch versions of a pull request.
- `gh-pr-versions clear <PULL_REQUEST_NUMBER>`
  Clear versions of a pull request.

Run `gh-pr-versions help` for more information.

### Example

```sh
# List all versions of PR#9999
gh-pr-versions list 9999

# Fetch all versions of PR#9999 into local branches `pulls/9999/*`
gh-pr-versions fetch 9999

# View commits in the latest version of the PR
git log pulls/9999/base..pulls/9999/latest

# Perform a range-diff between versions 1 and 2
git range-diff pulls/9999/base pulls/9999/v1 pulls/9999/v2

# Switch to the latest version
git switch pulls/9999/latest

# Remove all the `pulls/9999/*` branches
gh-pr-versions clear 9999
```

## How

This package makes use of the [GitHub GraphQL API for timeline items][timeline-items]. It uses some heuristics to determine if a new version was created. The API isn't idempotent, and some of these heuristics might not be fully accurate, so you might get some slightly different results for different invocations of `gh-pr-versions`.

Feel free to [open an issue][open-issue] if you get any unexpected results.

[interdiff]: https://gist.github.com/thoughtpolice/9c45287550a56b2047c6311fbadebed2
[github-diff-soup]: https://gist.github.com/thoughtpolice/9c45287550a56b2047c6311fbadebed2#the-github-school-of-code-review-diff-soup
[github-changesets]: https://mitchellh.com/writing/github-changesets
[butler-review]: https://blog.gitbutler.com/gitbutlers-new-patch-based-code-review/
[graphite]: https://graphite.dev/docs/pull-request-versions
[git-range-diff]: https://becca.ooo/blog/git-range-diff/
[timeline-items]: https://docs.github.com/en/graphql/reference/unions#pullrequesttimelineitems
[open-issue]: https://github.com/bnjmnt4n/gh-pr-versions/issues/new
