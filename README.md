# ERAG Reviewer

This is ERAG-Reviewer, an AI-based code review github action integrated with ERAG. This provides the code review agent codebase and product context, which are both critical for a great code review process.

## Overview

ERAG-Reviewer is an AI-based code reviewer and summarizer for
GitHub pull requests using ERAG and any available models in it such as `gpt-4o`, `gpt-3.5-turbo`, `gpt-4-turbo`, `bedrock-claude2`, `gemini-pro`, 
`bedrock-claude3.5-sonnet` and more.
It is designed to be used as a GitHub Action and can be configured to run on every pull request and review comments

## Reviewer Features:

- **PR Summarization**: It generates a summary and release notes of the changes
  in the pull request.
- **Line-by-line code change suggestions**: Reviews the changes line by line and
  provides code change suggestions.
- **Continuous, incremental reviews**: Reviews are performed on each commit
  within a pull request, rather than a one-time review on the entire pull
  request.
- **Cost-effective and reduced noise**: Incremental reviews save on LLM costs
  and reduce noise by tracking changed files between commits and the base of the
  pull request.
- **Chat with bot**: Supports conversation with the bot in the context of lines
  of code or entire files, useful for providing context, generating test cases,
  and reducing code complexity.
- **Smart review skipping**: By default, skips in-depth review for simple
  changes (e.g. typo fixes) and when changes look good for the most part. It can
  be disabled by setting `review_simple_changes` and `review_comment_lgtm` to
  `true`.
- **Customizable prompts and models**: Use `model` and `erag_project_name` to 
  customize the llm and project ERAG uses.Tailor the `system_message`, `summarize`, 
  and `summarize_release_notes` prompts to focus on specific aspects of the review
  process or even change the review objective.

To use this tool, you need to add the provided YAML file to your repository and
configure the required environment variables, such as `GITHUB_TOKEN` and
`ERAG_ACCESS_TOKEN`. For more information, you can refer to the sections below.

- [Reviewer Features](#reviewer-features)
- [Install instructions](#install-instructions)
- [Examples](#examples)

## Install instructions

`erag-reviewer` runs as a GitHub Action. Add the below file to your repository
at `.github/workflows/erag-reviewer.yml`

```yaml
name: Erag Reviewer

permissions:
  contents: read
  pull-requests: write

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
  pull_request_review_comment:
    types: [created]

concurrency:
  group:
    ${{ github.repository }}-${{ github.event.number || github.head_ref ||
    github.sha }}-${{ github.workflow }}-${{ github.event_name ==
    'pull_request_review_comment' && 'pr_comment' || 'pr' }}
  cancel-in-progress: ${{ github.event_name != 'pull_request_review_comment' }}

jobs:
  Review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: trilogy-group/erag-reviewer@main
        env:
          GITHUB_TOKEN: ${{ github.token }}
          ERAG_ACCESS_TOKEN: ${{ secrets.ERAG_ACCESS_TOKEN }}
        with:
          model: bedrock-claude3.5-sonnet
          erag_project_name: 'STUDYREEL'

```

#### Environment variables

- `GITHUB_TOKEN`: This should already be available to the GitHub Action
  environment. This is used to add comments to the pull request.
- `ERAG_ACCESS_TOKEN`: use this to authenticate with ERAG API. You can get one
  by first requesting an ERAG service account by following the instructions 
  [here](https://erag.trilogy.com/docs/guides/obtaining-an-access-token/)
  then using it to generate an access key. Please add this key to your GitHub Action 
  secrets.

### Models `gpt-4o`

Any model that is available in ERAG is supported. Some examples:
`gpt-4o`, `gpt-3.5-turbo`, `gpt-4-turbo`, `bedrock-claude2`, `gemini-pro`, `bedrock-claude3.5-sonnet`, `bedrock-mistral` or `pplx-sonar-medium-chat`

### Prompts & Configuration

See: [action.yml](./action.yml)

## Conversation with CodeRabbit

You can reply to a review comment made by this action and get a response based
on the diff context. Additionally, you can invite the bot to a conversation by
tagging it in the comment (`@askErag`).

Example:

> @askErag Please generate a test plan for this file.

Note: A review comment is a comment made on a diff or a file in the pull
request.

### Ignoring PRs

Sometimes it is useful to ignore a PR. For example, if you are using this action
to review documentation, you can ignore PRs that only change the documentation.
To ignore a PR, add the following keyword in the PR description:

```text
@erag: ignore
```

## Examples

Some of the reviews done by erag-reviewer

---COMING SOON---

Any suggestions or pull requests for improving the prompts are highly
appreciated.

## Contribute

### Developing

> First, you'll need to have a reasonably modern version of `node` handy, tested
> with node 17+.

Install the dependencies

```bash
$ npm install
```

Build the typescript and package it for distribution

```bash
$ npm run build && npm run package
```

## FAQs

### Review pull requests from forks

GitHub Actions limits the access of secrets from forked repositories. To enable
this feature, you need to use the `pull_request_target` event instead of
`pull_request` in your workflow file. Note that with `pull_request_target`, you
need extra configuration to ensure checking out the right commit:

```yaml
name: Code Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request_target:
    types: [opened, synchronize, reopened]
  pull_request_review_comment:
    types: [created]

concurrency:
  group:
    ${{ github.repository }}-${{ github.event.number || github.head_ref ||
    github.sha }}-${{ github.workflow }}-${{ github.event_name ==
    'pull_request_review_comment' && 'pr_comment' || 'pr' }}
  cancel-in-progress: ${{ github.event_name != 'pull_request_review_comment' }}

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: coderabbitai/ai-pr-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
          review_simple_changes: false
          review_comment_lgtm: false
```

See also:
https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target

### Inspect the messages between ERAG server

Set `debug: true` in the workflow file to enable debug mode, which will show the
messages
