import {type Inputs} from './inputs'

export class Prompts {
  systemMessage = `$system_message

`

  summarize = `
Provide your final response in markdown with the following content:

- **Walkthrough**: A high-level summary of the overall change instead of 
  specific files within 80 words.
- **Changes**: A markdown table of files and their summaries. Group files 
  with similar changes together into a single row to save space.

Avoid additional commentary as this summary will be added as a comment on the 
GitHub pull request. Use the titles "Walkthrough" and "Changes" and they must be H2.
`

  summarizeReleaseNotes = `
Craft concise release notes for the pull request. 
Focus on the purpose and user impact, categorizing changes as "New Feature", "Bug Fix", 
"Documentation", "Refactor", "Style", "Test", "Chore", or "Revert". Provide a bullet-point list, 
e.g., "- New Feature: Added search functionality to the UI". Limit your response to 50-100 words 
and emphasize features visible to the end-user while omitting code-level details.
`

  summarizeFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Diff

\`\`\`diff
$file_diff
\`\`\`

## Instructions

I would like you to succinctly summarize the diff within 100 words.
If applicable, your summary should include a note about alterations 
to the signatures of exported functions, global data structures and 
variables, and any changes that might affect the external interface or 
behavior of the code.

Additionally, please provide an array of symbols (e.g., function names, variable names) 
that were changed in the diff. This array will be used to search for occurrences 
of these symbols in the codebase. The array can be empty if no relevant symbols were changed. 
You must strictly follow the format below for the array:
SYMBOLS: [symbol1, symbol2, ...]

Below the summary, I would also like you to triage the diff as \`NEEDS_REVIEW\` or 
\`APPROVED\` based on the following criteria:

- If the diff involves any modifications to the logic or functionality, even if they 
  seem minor, triage it as \`NEEDS_REVIEW\`. This includes changes to control structures, 
  function calls, or variable assignments that might impact the behavior of the code.
- If the diff only contains very minor changes that don't affect the code logic, such as 
  fixing typos, formatting, or renaming variables for clarity, triage it as \`APPROVED\`.

Please evaluate the diff thoroughly and take into account factors such as the number of 
lines changed, the potential impact on the overall system, and the likelihood of 
introducing new bugs or security vulnerabilities. 
When in doubt, always err on the side of caution and triage the diff as \`NEEDS_REVIEW\`.

You must strictly follow the format below for triaging the diff:
[TRIAGE]: <NEEDS_REVIEW or APPROVED>

Important:
- In your summary do not mention that the file needs a thorough review or caution about
  potential issues.
- Do not provide any reasoning why you triaged the diff as \`NEEDS_REVIEW\` or \`APPROVED\`.
- Do not mention that these changes affect the logic or functionality of the code in 
  the summary. You must only use the triage status format above to indicate that.
`

  summarizeChangesets = `Provided below are changesets in this pull request. Changesets 
are in chronlogical order and new changesets are appended to the
end of the list. The format consists of filename(s) and the summary 
of changes for those files. There is a separator between each changeset.
Your task is to deduplicate and group together files with
related/similar changes into a single changeset. Respond with the updated 
changesets using the same format as the input. 

$raw_summary
`

  summarizePrefix = `Here is the summary of changes you have generated for files:
      \`\`\`
      $raw_summary
      \`\`\`

`

  summarizeShort = `Your task is to provide a concise summary of the changes. This 
summary will be used as a prompt while reviewing each file and must be very clear for 
the AI bot to understand. 

Instructions:

- Focus on summarizing only the changes in the PR and stick to the facts.
- Do not provide any instructions to the bot on how to perform the review.
- Do not mention that files need a through review or caution about potential issues.
- Do not mention that these changes affect the logic or functionality of the code.
- The summary should not exceed 500 words.
`

  reviewFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Summary of changes

\`\`\`
$short_summary
\`\`\`

## Symbol Search Results

\`\`\`
$symbol_search_results
\`\`\`

## IMPORTANT Instructions

Input: New hunks annotated with line numbers and old hunks (replaced code). Hunks represent incomplete code fragments.
Additional Context: PR title, description, summaries, comment chains, and symbol search results (occurrences of modified symbols in the codebase).
Task: Review new hunks for substantive issues using provided context and respond with comments if necessary.
Output: Review comments in markdown with exact line number ranges in new hunks. Start and end line numbers must be within the same hunk. For single-line comments, start=end line number. Must use example response format below.
Use fenced code blocks using the relevant language identifier where applicable.
Don't annotate code snippets with line numbers. Format and indent code correctly.
For fixes, use \`suggestion\` code blocks. The line number range for comments with fix snippets must exactly match the range to replace in the new hunk.
You must carefully include any lines of code that remain unchanged in the replacement snippet to avoid issues when the replacement snippet is committed as-is.
Replacement snippet must be complete, correctly formatted & indented and without the line number annotations.

- Do NOT provide general feedback, summaries, explanations of changes, or praises 
  for making good additions. 
- Do not provide general comments about making sure occurrences of modified symbols are updated. Instead analyze 
  the symbol search results to ensure that all instances of a modified function, variable, or other symbol are 
  correctly updated and provide specific feedback on any discrepancies found. 
- Focus solely on offering specific, objective insights based on the 
  given context and refrain from making broad comments about potential impacts on 
  the system or question intentions behind the changes.

If there are no issues found on a line range, you MUST respond with the 
text \`LGTM!\` for that line range in the review section. 

## Example

### Example changes

---new_hunk---
\`\`\`
  z = x / y
    return z

15: def complex_function(x, y):
16:     a = x * 2
17:     b = y / 3
18:     return a + b
19:
20: def add(x, y):
21:     z = x + y
22:     retrn z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
  
---old_hunk---
\`\`\`
  z = x / y
    return z

def complex_function(x, y):
    return x + y

def add(x, y):
    return x + y

def subtract(x, y):
    z = x - y
\`\`\`

---comment_chains---
\`\`\`
Please review this change.
\`\`\`

---end_change_section---

### Example response

15-18:
I suggest the following improvements:
\`\`\`suggestion
def complex_function(x, y):
    a = x ** 2
    b = y ** 3
    c = a + b
    return c / 2
\`\`\`
---
22-22:
There's a syntax error in the add function.
\`\`\`suggestion
    return z
\`\`\`
---
24-25:
LGTM!
---

## Changes made to \`$filename\` for your review

$patches
`

  comment = `A comment was made on a GitHub PR review for a 
diff hunk on a file - \`$filename\`. I would like you to follow 
the instructions in that comment. 

## GitHub PR Title

\`$title\`

## Description

\`\`\`
$description
\`\`\`

## Summary generated by the AI bot

\`\`\`
$short_summary
\`\`\`

## Entire diff

\`\`\`diff
$file_diff
\`\`\`

## Diff being commented on

\`\`\`diff
$diff
\`\`\`

## Instructions

Please reply directly to the new comment (instead of suggesting 
a reply) and your reply will be posted as-is.

If the comment contains instructions/requests for you, please comply. 
For example, if the comment is asking you to generate documentation 
comments on the code, in your reply please generate the required code.

In your reply, please make sure to begin the reply by tagging the user 
with "@user".

## Comment format

\`user: comment\`

## Comment chain (including the new comment)

\`\`\`
$comment_chain
\`\`\`

## The comment/request that you need to directly reply to

\`\`\`
$comment
\`\`\`
`

  renderSummarizeFileDiff(inputs: Inputs): string {
    const prompt = this.systemMessage + this.summarizeFileDiff
    return inputs.render(prompt)
  }

  renderSummarizeChangesets(inputs: Inputs): string {
    const prompt = this.systemMessage + this.summarizeChangesets
    return inputs.render(prompt)
  }

  renderSummarize(inputs: Inputs): string {
    const prompt = this.systemMessage + this.summarizePrefix + this.summarize
    return inputs.render(prompt)
  }

  renderSummarizeShort(inputs: Inputs): string {
    const prompt = this.systemMessage + this.summarizePrefix + this.summarizeShort
    return inputs.render(prompt)
  }

  renderSummarizeReleaseNotes(inputs: Inputs): string {
    const prompt = this.systemMessage + this.summarizePrefix + this.summarizeReleaseNotes
    return inputs.render(prompt)
  }

  renderComment(inputs: Inputs): string {
    const prompt = this.systemMessage + this.comment
    return inputs.render(prompt)
  }

  renderReviewFileDiff(inputs: Inputs): string {
    const prompt = this.systemMessage + this.reviewFileDiff
    return inputs.render(prompt)
  }
}
