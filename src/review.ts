import {error, info, warning} from '@actions/core'
// eslint-disable-next-line camelcase
import {context as github_context} from '@actions/github'
import pLimit from 'p-limit'
import {type Bot} from './bot'
import {
  Commenter,
  COMMENT_REPLY_TAG,
  RAW_SUMMARY_END_TAG,
  RAW_SUMMARY_START_TAG,
  SHORT_SUMMARY_END_TAG,
  SHORT_SUMMARY_START_TAG,
  SUMMARIZE_TAG
} from './commenter'
import {Inputs} from './inputs'
import {octokit} from './octokit'
import {type Options} from './options'
import {type Prompts} from './prompts'
import {getTokenCount} from './tokenizer'
import {execFile} from 'child_process'
import {promisify} from 'util'
import path from 'path'

// eslint-disable-next-line camelcase
const context = github_context
const repo = context.repo

const rgPath = path.join(__dirname, './rg')
const execFileAsync = promisify(execFile)

const ignoreKeyword = '@erag: ignore'

export async function codeReview(reviewBot: Bot, options: Options, prompts: Prompts): Promise<void> {
  const commenter: Commenter = new Commenter()

  const eragConcurrencyLimit = pLimit(options.eragConcurrencyLimit)

  if (!isPullRequestEvent()) {
    return
  }
  const pullRequest = context.payload.pull_request!

  const inputs = initializeInputs(pullRequest, options, commenter)
  if (inputs.description.includes(ignoreKeyword)) {
    info('Skipped: description contains ignore_keyword')
    return
  }

  const {existingSummarizeCmtBody, existingCommitIdsBlock} = await getExistingSummarizeComment(pullRequest, commenter, inputs)

  const highestReviewedCommitId = await determineHighestReviewedCommitId(existingCommitIdsBlock, pullRequest, commenter)

  const {files, commits} = await fetchDiffFiles(highestReviewedCommitId, pullRequest)
  if (!files) {
    warning('Skipped: files is null')
    return
  }

  const {filterSelectedFiles, filterIgnoredFiles} = filterFilesByPath(files, options)
  if (filterSelectedFiles.length === 0) {
    warning('Skipped: filterSelectedFiles is null')
    return
  }

  const filesAndChanges = await getFilesAndChanges(filterSelectedFiles, pullRequest, options)
  if (filesAndChanges.length === 0) {
    error('Skipped: no files to review')
    return
  }

  let statusMsg = `<details>
<summary>Commits</summary>
Files that changed from the base of the PR and between ${highestReviewedCommitId} and ${pullRequest.head.sha} commits.
</details>
${
  filesAndChanges.length > 0
    ? `
<details>
<summary>Files selected (${filesAndChanges.length})</summary>

* ${filesAndChanges.map(([filename, , , patches]) => `${filename} (${patches.length})`).join('\n* ')}
</details>
`
    : ''
}
${
  filterIgnoredFiles.length > 0
    ? `
<details>
<summary>Files ignored due to filter (${filterIgnoredFiles.length})</summary>

* ${filterIgnoredFiles.map(file => file.filename).join('\n* ')}

</details>
`
    : ''
}
`

  // update the existing comment with in progress status
  const inProgressSummarizeCmt = commenter.addInProgressStatus(existingSummarizeCmtBody, statusMsg)

  // add in progress status to the summarize comment
  await commenter.comment(`${inProgressSummarizeCmt}`, SUMMARIZE_TAG, 'replace')

  const summariesFailed: string[] = []

  const doSummary = async (filename: string, fileContent: string, fileDiff: string): Promise<[string, string, boolean, string[]] | null> => {
    info(`summarize: ${filename}`)
    const ins = inputs.clone()
    if (fileDiff.length === 0) {
      warning(`summarize: file_diff is empty, skip ${filename}`)
      summariesFailed.push(`${filename} (empty diff)`)
      return null
    }

    ins.filename = filename
    ins.fileDiff = fileDiff

    // render prompt based on inputs so far
    const summarizePrompt = prompts.renderSummarizeFileDiff(ins)
    const tokens = getTokenCount(summarizePrompt)

    if (tokens > options.tokenLimits.requestTokens) {
      info(`summarize: diff tokens exceeds limit, skip ${filename}`)
      summariesFailed.push(`${filename} (diff tokens exceeds limit)`)
      return null
    }

    // summarize content
    try {
      const summarizeResp = await reviewBot.chat(summarizePrompt)

      if (summarizeResp === '') {
        info('summarize: nothing obtained from erag')
        summariesFailed.push(`${filename} (nothing obtained from erag)`)
        return null
      } else {
        // parse the comment to look for triage classification
        // Format is : [TRIAGE]: <NEEDS_REVIEW or APPROVED>
        // if the change needs review return true, else false
        let needsReview = false
        let summary = summarizeResp
        let symbols: string[] = []

        const triageRegex = /\[TRIAGE\]:\s*(NEEDS_REVIEW|APPROVED)/
        const triageMatch = summarizeResp.match(triageRegex)
        if (triageMatch != null) {
          const triage = triageMatch[1]
          needsReview = triage === 'NEEDS_REVIEW'
          // remove this line from the comment
          summary = summarizeResp.replace(triageRegex, '').trim()
          info(`filename: ${filename}, triage: ${triage}`)
        }

        // Symbols to search for in the codebase to give more context to the LLM
        const symbolsRegex = /SYMBOLS:\s*(\[.*?\])/
        const symbolsMatch = summarizeResp.match(symbolsRegex)
        if (symbolsMatch != null) {
          const symbolsStr = symbolsMatch[1]
          symbols = symbolsStr
            .replace('[', '')
            .replace(']', '')
            .split(',')
            .map(symbol => symbol.trim().replace(/^"|"$/g, ''))

          summary = summary.replace(symbolsRegex, '').trim()
        }

        return [filename, summary, needsReview, symbols]
      }
    } catch (e: any) {
      warning(`summarize: error from erag: ${e as string}`)
      summariesFailed.push(`${filename} (error from erag: ${e as string})})`)
      return null
    }
  }

  const summaryPromises = []
  const skippedFiles = []
  for (const [filename, fileContent, fileDiff] of filesAndChanges) {
    if (options.maxFiles <= 0 || summaryPromises.length < options.maxFiles) {
      summaryPromises.push(eragConcurrencyLimit(async () => await doSummary(filename, fileContent, fileDiff)))
    } else {
      skippedFiles.push(filename)
    }
  }

  const summaries = (await Promise.all(summaryPromises)).filter(summary => summary !== null) as Array<[string, string, boolean, string[]]>

  if (summaries.length > 0) {
    const batchSize = 10
    // join summaries into one in the batches of batchSize
    // and ask the bot to summarize the summaries
    for (let i = 0; i < summaries.length; i += batchSize) {
      const summariesBatch = summaries.slice(i, i + batchSize)
      for (const [filename, summary] of summariesBatch) {
        inputs.rawSummary += `---
${filename}: ${summary}
`
      }
      // ask chatgpt to summarize the summaries
      const summarizeResp = await reviewBot.chat(prompts.renderSummarizeChangesets(inputs))
      if (summarizeResp === '') {
        warning('summarize: nothing obtained from erag')
      } else {
        inputs.rawSummary = summarizeResp
      }
    }
  }

  // final summary
  const summarizeFinalResponse = await reviewBot.chat(prompts.renderSummarize(inputs))
  if (summarizeFinalResponse === '') {
    info('summarize: nothing obtained from erag')
  }

  if (options.disableReleaseNotes === false) {
    // final release notes
    const releaseNotesResponse = await reviewBot.chat(prompts.renderSummarizeReleaseNotes(inputs))
    if (releaseNotesResponse === '') {
      info('release notes: nothing obtained from erag')
    } else {
      let message = '### Summary by Erag Reviewer\n\n'
      message += releaseNotesResponse
      try {
        await commenter.updateDescription(pullRequest.number, message)
      } catch (e: any) {
        warning(`release notes: error from github: ${e.message as string}`)
      }
    }
  }

  // generate a short summary as well
  const summarizeShortResponse = await reviewBot.chat(prompts.renderSummarizeShort(inputs))
  inputs.shortSummary = summarizeShortResponse

  let summarizeComment = `${summarizeFinalResponse}
${RAW_SUMMARY_START_TAG}
${inputs.rawSummary}
${RAW_SUMMARY_END_TAG}
${SHORT_SUMMARY_START_TAG}
${inputs.shortSummary}
${SHORT_SUMMARY_END_TAG}`

  statusMsg += `
${
  skippedFiles.length > 0
    ? `
<details>
<summary>Files not processed due to max files limit (${skippedFiles.length})</summary>

* ${skippedFiles.join('\n* ')}

</details>
`
    : ''
}
${
  summariesFailed.length > 0
    ? `
<details>
<summary>Files not summarized due to errors (${summariesFailed.length})</summary>

* ${summariesFailed.join('\n* ')}

</details>
`
    : ''
}
`

  if (!options.disableReview) {
    const filesAndChangesReview = filesAndChanges
      .filter(([filename]) => {
        const needsReview = summaries.find(([summaryFilename]) => summaryFilename === filename)?.[2] ?? true
        return needsReview
      })
      .map(([filename, fileContent, fileDiff, patches]) => {
        const summaryEntry = summaries.find(([summaryFilename]) => summaryFilename === filename)
        const symbols = summaryEntry ? summaryEntry[3] : []
        return [filename, fileContent, fileDiff, patches, symbols] as [string, string, string, [number, number, string][], string[]]
      })

    const reviewsSkipped = filesAndChanges
      .filter(([filename]) => !filesAndChangesReview.some(([reviewFilename]) => reviewFilename === filename))
      .map(([filename]) => filename)

    // failed reviews array
    const reviewsFailed: string[] = []
    let lgtmCount = 0
    let reviewCount = 0
    const doReview = async (filename: string, fileContent: string, patches: Array<[number, number, string]>, symbols: string[]): Promise<void> => {
      info(`reviewing ${filename}`)
      info(`patches: ${patches}`)
      info(`symbols: ${symbols}`)

      const symbolSearchResults = await searchSymbols(symbols)
      info(`symbolSearchResults: ${symbolSearchResults}`)

      // make a copy of inputs
      const ins: Inputs = inputs.clone()
      ins.filename = filename

      // calculate tokens based on inputs so far
      let tokens = getTokenCount(prompts.renderReviewFileDiff(ins))
      // loop to calculate total patch tokens
      let patchesToPack = 0
      for (const [, , patch] of patches) {
        const patchTokens = getTokenCount(patch)
        if (tokens + patchTokens > options.tokenLimits.requestTokens) {
          info(`only packing ${patchesToPack} / ${patches.length} patches, tokens: ${tokens} / ${options.tokenLimits.requestTokens}`)
          break
        }
        tokens += patchTokens
        patchesToPack += 1
      }

      let patchesPacked = 0
      for (const [startLine, endLine, patch] of patches) {
        // see if we can pack more patches into this request
        if (patchesPacked >= patchesToPack) {
          info(`unable to pack more patches into this request, packed: ${patchesPacked}, total patches: ${patches.length}, skipping.`)
          if (options.debug) {
            info(`prompt so far: ${prompts.renderReviewFileDiff(ins)}`)
          }
          break
        }
        patchesPacked += 1

        let commentChain = ''
        try {
          const allChains = await commenter.getCommentChainsWithinRange(pullRequest.number, filename, startLine, endLine, COMMENT_REPLY_TAG)

          if (allChains.length > 0) {
            info(`Found comment chains: ${allChains} for ${filename}`)
            commentChain = allChains
          }
        } catch (e: any) {
          warning(`Failed to get comments: ${e as string}, skipping. backtrace: ${e.stack as string}`)
        }
        // try packing comment_chain into this request
        const commentChainTokens = getTokenCount(commentChain)
        if (tokens + commentChainTokens > options.tokenLimits.requestTokens) {
          commentChain = ''
        } else {
          tokens += commentChainTokens
        }

        ins.patches += `
${patch}
`
        if (commentChain !== '') {
          ins.patches += `
---comment_chains---
\`\`\`
${commentChain}
\`\`\`
`
        }

        ins.patches += `
---end_change_section---
`
      }

      if (patchesPacked > 0) {
        // perform review
        try {
          const response = await reviewBot.chat(prompts.renderReviewFileDiff(ins))
          if (response === '') {
            info('review: nothing obtained from erag')
            reviewsFailed.push(`${filename} (no response)`)
            return
          }
          // parse review
          const reviews = parseReview(response, patches, options.debug)
          for (const review of reviews) {
            // check for LGTM
            if (review.comment.includes('LGTM') || review.comment.includes('looks good to me')) {
              lgtmCount += 1
              continue
            }

            try {
              reviewCount += 1
              await commenter.bufferReviewComment(filename, review.startLine, review.endLine, `${review.comment}`)
            } catch (e: any) {
              reviewsFailed.push(`${filename} comment failed (${e as string})`)
            }
          }
        } catch (e: any) {
          warning(`Failed to review: ${e as string}, skipping. backtrace: ${e.stack as string}`)
          reviewsFailed.push(`${filename} (${e as string})`)
        }
      } else {
        reviewsSkipped.push(`${filename} (diff too large)`)
      }
    }

    const reviewPromises = []
    for (const [filename, fileContent, , patches, symbols] of filesAndChangesReview) {
      if (options.maxFiles <= 0 || reviewPromises.length < options.maxFiles) {
        reviewPromises.push(
          eragConcurrencyLimit(async () => {
            await doReview(filename, fileContent, patches, symbols)
          })
        )
      } else {
        skippedFiles.push(filename)
      }
    }

    await Promise.all(reviewPromises)

    statusMsg += `
${
  reviewsFailed.length > 0
    ? `<details>
<summary>Files not reviewed due to errors (${reviewsFailed.length})</summary>

* ${reviewsFailed.join('\n* ')}

</details>
`
    : ''
}
${
  reviewsSkipped.length > 0
    ? `<details>
<summary>Files skipped from review due to trivial changes (${reviewsSkipped.length})</summary>

* ${reviewsSkipped.join('\n* ')}

</details>
`
    : ''
}
<details>
<summary>Review comments generated (${reviewCount + lgtmCount})</summary>

* Review: ${reviewCount}
* LGTM: ${lgtmCount}

</details>

---

<details>
<summary>Tips</summary>

### Chat with <img src="https://raw.githubusercontent.com/trilogy-group/ai-pr-reviewer/main/docs/images/EragIcon.png" alt="Image description" width="20" height="20">  ERAG Reviewer (\`@erag\`)
- Reply on review comments left by this bot to ask follow-up questions. A review comment is a comment on a diff or a file.
- Invite the bot into a review comment chain by tagging \`@erag\` in a reply.

### Code suggestions
- The bot may make code suggestions, but please review them carefully before committing since the line number ranges may be misaligned. 
- You can edit the comment made by the bot and manually tweak the suggestion if it is slightly off.

### Pausing incremental reviews
- Add \`@erag: ignore\` anywhere in the PR description to pause further reviews from the bot.

</details>
`
    // add existing_comment_ids_block with latest head sha
    summarizeComment += `\n${commenter.addReviewedCommitId(existingCommitIdsBlock, pullRequest.head.sha)}`

    // post the review
    await commenter.submitReview(pullRequest.number, commits[commits.length - 1].sha, statusMsg)
  }

  // post the final summary comment
  await commenter.comment(`${summarizeComment}`, SUMMARIZE_TAG, 'replace')
}

async function searchSymbols(symbols: string[]): Promise<string> {
  // Uses ripgrep to search for the symbols in the codebase
  let searchResults = ''

  for (const symbol of symbols) {
    try {
      info(`Searching for symbol ${symbol} in the current directory: ${process.cwd()}`)
      // INSERT_YOUR_CODE
      const {stdout: lsOutput} = await execFileAsync('ls', ['-la'], {cwd: process.cwd()})
      info(`Files and directories in the current directory:\n${lsOutput}`)

      searchResults += `---${symbol}---\n`
      const {stdout} = await execFileAsync(rgPath, [symbol, '-n', '-w', '.'], {maxBuffer: 1024 * 1024})
      searchResults += `${stdout.trim()}\n`
    } catch (err: any) {
      if (err.code === 1) {
        // Ripgrep exits with code 1 if no matches are found
        info(`No matches found for symbol ${symbol}`)
        searchResults += `No matches found for symbol ${symbol}\n`
      } else {
        warning(`Error searching for symbol ${symbol}: ${err.message as string}`)
      }
    }
  }

  return searchResults
}

async function determineHighestReviewedCommitId(existingCommitIdsBlock: string, pullRequest: any, commenter: Commenter) {
  const allCommitIds = await commenter.getAllCommitIds()
  let highestReviewedCommitId = ''
  if (existingCommitIdsBlock !== '') {
    highestReviewedCommitId = commenter.getHighestReviewedCommitId(allCommitIds, commenter.getReviewedCommitIds(existingCommitIdsBlock))
  }

  if (highestReviewedCommitId === '' || highestReviewedCommitId === pullRequest.head.sha) {
    info(`Will review from the base commit: ${pullRequest.base.sha as string}`)
    highestReviewedCommitId = pullRequest.base.sha
  } else {
    info(`Will review from commit: ${highestReviewedCommitId}`)
  }
  return highestReviewedCommitId
}

async function fetchDiffFiles(highestReviewedCommitId: string, pullRequest: any) {
  // Fetch the diff between the highest reviewed commit and the latest commit of the PR branch
  const incrementalDiff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: highestReviewedCommitId,
    head: pullRequest.head.sha
  })

  // Fetch the diff between the target branch's base commit and the latest commit of the PR branch
  const targetBranchDiff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: pullRequest.base.sha,
    head: pullRequest.head.sha
  })

  const incrementalFiles = incrementalDiff.data.files
  const targetBranchFiles = targetBranchDiff.data.files
  const commits = incrementalDiff.data.commits

  if (!incrementalFiles || !targetBranchFiles || !commits) {
    warning('Skipped: files data is missing')
    return {files: [], commits: []}
  }

  // Get files that were changed in the last commit which are also changed compared to the PR base commit
  const files = targetBranchFiles.filter(targetBranchFile =>
    incrementalFiles.some(incrementalFile => incrementalFile.filename === targetBranchFile.filename)
  )

  return {files, commits}
}

async function getFilesAndChanges(filterSelectedFiles: any, pullRequest: any, options: Options) {
  const githubConcurrencyLimit = pLimit(options.githubConcurrencyLimit)
  // find hunks to review
  const filteredFiles: Array<[string, string, string, Array<[number, number, string]>] | null> = await Promise.all(
    filterSelectedFiles.map((file: any) =>
      githubConcurrencyLimit(async () => {
        // retrieve file contents
        let fileContent = ''
        try {
          const contents = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            path: file.filename,
            ref: pullRequest.base.sha
          })
          if (contents.data != null) {
            if (!Array.isArray(contents.data)) {
              if (contents.data.type === 'file' && contents.data.content != null) {
                fileContent = Buffer.from(contents.data.content, 'base64').toString()
              }
            }
          }
        } catch (e: any) {
          warning(`Failed to get file contents: ${e as string}. This is OK if it's a new file.`)
        }

        let fileDiff = ''
        if (file.patch != null) {
          fileDiff = file.patch
        }

        const patches: Array<[number, number, string]> = []
        for (const patch of splitPatch(file.patch)) {
          const patchLines = patchStartEndLine(patch)
          if (patchLines == null) {
            continue
          }
          const hunks = parsePatch(patch)
          if (hunks == null) {
            continue
          }
          const hunksStr = `
---new_hunk---
\`\`\`
${hunks.newHunk}
\`\`\`

---old_hunk---
\`\`\`
${hunks.oldHunk}
\`\`\`
`
          patches.push([patchLines.newHunk.startLine, patchLines.newHunk.endLine, hunksStr])
        }
        if (patches.length > 0) {
          return [file.filename, fileContent, fileDiff, patches] as [string, string, string, Array<[number, number, string]>]
        } else {
          return null
        }
      })
    )
  )

  // Filter out any null results
  return filteredFiles.filter(file => file !== null) as Array<[string, string, string, Array<[number, number, string]>]>
}

function filterFilesByPath(files: any, options: Options) {
  const filterSelectedFiles = []
  const filterIgnoredFiles = []
  for (const file of files) {
    if (!options.pathFilters.check(file.filename)) {
      info(`skip for excluded path: ${file.filename}`)
      filterIgnoredFiles.push(file)
    } else {
      filterSelectedFiles.push(file)
    }
  }
  return {filterSelectedFiles, filterIgnoredFiles}
}

async function getExistingSummarizeComment(pullRequest: any, commenter: Commenter, inputs: Inputs) {
  const existingSummarizeCmt = await commenter.findCommentWithTag(SUMMARIZE_TAG, pullRequest.number)
  if (existingSummarizeCmt) {
    const existingSummarizeCmtBody = existingSummarizeCmt.body
    const existingCommitIdsBlock = commenter.getReviewedCommitIdsBlock(existingSummarizeCmtBody)
    inputs.rawSummary = commenter.getRawSummary(existingSummarizeCmtBody)
    inputs.shortSummary = commenter.getShortSummary(existingSummarizeCmtBody)
    return {existingSummarizeCmtBody, existingCommitIdsBlock}
  }
  return {existingSummarizeCmtBody: '', existingCommitIdsBlock: ''}
}

function initializeInputs(pullRequest: any, options: Options, commenter: Commenter) {
  const inputs: Inputs = new Inputs()
  inputs.systemMessage = options.systemMessage
  inputs.title = pullRequest.title
  if (pullRequest.body) {
    inputs.description = commenter.getDescription(pullRequest.body)
  }
  return inputs
}

function isPullRequestEvent(): boolean {
  if (context.eventName !== 'pull_request' && context.eventName !== 'pull_request_target') {
    warning(`Skipped: current event is ${context.eventName}, only support pull_request event`)
    return false
  }
  if (context.payload.pull_request == null) {
    warning('Skipped: context.payload.pull_request is null')
    return false
  }
  return true
}

function splitPatch(patch: string | null | undefined): string[] {
  if (patch == null) {
    return []
  }

  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@).*$/gm

  const result: string[] = []
  let last = -1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(patch)) !== null) {
    if (last === -1) {
      last = match.index
    } else {
      result.push(patch.substring(last, match.index))
      last = match.index
    }
  }
  if (last !== -1) {
    result.push(patch.substring(last))
  }
  return result
}

function patchStartEndLine(patch: string): {
  oldHunk: {startLine: number; endLine: number}
  newHunk: {startLine: number; endLine: number}
} | null {
  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm
  const match = pattern.exec(patch)
  if (match != null) {
    const oldBegin = parseInt(match[2])
    const oldDiff = parseInt(match[3])
    const newBegin = parseInt(match[4])
    const newDiff = parseInt(match[5])
    return {
      oldHunk: {
        startLine: oldBegin,
        endLine: oldBegin + oldDiff - 1
      },
      newHunk: {
        startLine: newBegin,
        endLine: newBegin + newDiff - 1
      }
    }
  } else {
    return null
  }
}

function parsePatch(patch: string): {oldHunk: string; newHunk: string} | null {
  const hunkInfo = patchStartEndLine(patch)
  if (hunkInfo == null) {
    return null
  }

  const oldHunkLines: string[] = []
  const newHunkLines: string[] = []

  let newLine = hunkInfo.newHunk.startLine

  const lines = patch.split('\n').slice(1) // Skip the @@ line

  // Remove the last line if it's empty
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }

  // Skip annotations for the first 3 and last 3 lines
  const skipStart = 3
  const skipEnd = 3

  let currentLine = 0

  const removalOnly = !lines.some(line => line.startsWith('+'))

  for (const line of lines) {
    currentLine++
    if (line.startsWith('-')) {
      oldHunkLines.push(`${line.substring(1)}`)
    } else if (line.startsWith('+')) {
      newHunkLines.push(`${newLine}: ${line.substring(1)}`)
      newLine++
    } else {
      // context line
      oldHunkLines.push(`${line}`)
      if (removalOnly || (currentLine > skipStart && currentLine <= lines.length - skipEnd)) {
        newHunkLines.push(`${newLine}: ${line}`)
      } else {
        newHunkLines.push(`${line}`)
      }
      newLine++
    }
  }

  return {
    oldHunk: oldHunkLines.join('\n'),
    newHunk: newHunkLines.join('\n')
  }
}

interface Review {
  startLine: number
  endLine: number
  comment: string
}

function parseReview(response: string, patches: Array<[number, number, string]>, debug = false): Review[] {
  const reviews: Review[] = []

  response = sanitizeResponse(response.trim())

  const lines = response.split('\n')
  const lineNumberRangeRegex = /(?:^|\s)(\d+)-(\d+):\s*$/
  const commentSeparator = '---'

  let currentStartLine: number | null = null
  let currentEndLine: number | null = null
  let currentComment = ''
  function storeReview(): void {
    if (currentStartLine !== null && currentEndLine !== null) {
      const review: Review = {
        startLine: currentStartLine,
        endLine: currentEndLine,
        comment: currentComment
      }

      let withinPatch = false
      let bestPatchStartLine = -1
      let bestPatchEndLine = -1
      let maxIntersection = 0

      for (const [startLine, endLine] of patches) {
        const intersectionStart = Math.max(review.startLine, startLine)
        const intersectionEnd = Math.min(review.endLine, endLine)
        const intersectionLength = Math.max(0, intersectionEnd - intersectionStart + 1)

        if (intersectionLength > maxIntersection) {
          maxIntersection = intersectionLength
          bestPatchStartLine = startLine
          bestPatchEndLine = endLine
          withinPatch = intersectionLength === review.endLine - review.startLine + 1
        }

        if (withinPatch) break
      }

      if (!withinPatch) {
        if (bestPatchStartLine !== -1 && bestPatchEndLine !== -1) {
          review.comment = `> Note: This review was outside of the patch, so it was mapped to the patch with the greatest overlap. Original lines [${review.startLine}-${review.endLine}]

${review.comment}`
          review.startLine = bestPatchStartLine
          review.endLine = bestPatchEndLine
        } else {
          review.comment = `> Note: This review was outside of the patch, but no patch was found that overlapped with it. Original lines [${review.startLine}-${review.endLine}]

${review.comment}`
          review.startLine = patches[0][0]
          review.endLine = patches[0][1]
        }
      }

      reviews.push(review)

      info(`Stored comment for line range ${currentStartLine}-${currentEndLine}: ${currentComment.trim()}`)
    }
  }

  function sanitizeCodeBlock(comment: string, codeBlockLabel: string): string {
    const codeBlockStart = `\`\`\`${codeBlockLabel}`
    const codeBlockEnd = '```'
    const lineNumberRegex = /^ *(\d+): /gm

    let codeBlockStartIndex = comment.indexOf(codeBlockStart)

    while (codeBlockStartIndex !== -1) {
      const codeBlockEndIndex = comment.indexOf(codeBlockEnd, codeBlockStartIndex + codeBlockStart.length)

      if (codeBlockEndIndex === -1) break

      const codeBlock = comment.substring(codeBlockStartIndex + codeBlockStart.length, codeBlockEndIndex)
      const sanitizedBlock = codeBlock.replace(lineNumberRegex, '')

      comment = comment.slice(0, codeBlockStartIndex + codeBlockStart.length) + sanitizedBlock + comment.slice(codeBlockEndIndex)

      codeBlockStartIndex = comment.indexOf(codeBlockStart, codeBlockStartIndex + codeBlockStart.length + sanitizedBlock.length + codeBlockEnd.length)
    }

    return comment
  }

  function sanitizeResponse(comment: string): string {
    comment = sanitizeCodeBlock(comment, 'suggestion')
    comment = sanitizeCodeBlock(comment, 'diff')
    return comment
  }

  for (const line of lines) {
    const lineNumberRangeMatch = line.match(lineNumberRangeRegex)

    if (lineNumberRangeMatch != null) {
      storeReview()
      currentStartLine = parseInt(lineNumberRangeMatch[1], 10)
      currentEndLine = parseInt(lineNumberRangeMatch[2], 10)
      currentComment = ''
      if (debug) {
        info(`Found line number range: ${currentStartLine}-${currentEndLine}`)
      }
      continue
    }

    if (line.trim() === commentSeparator) {
      storeReview()
      currentStartLine = null
      currentEndLine = null
      currentComment = ''
      if (debug) {
        info('Found comment separator')
      }
      continue
    }

    if (currentStartLine !== null && currentEndLine !== null) {
      currentComment += `${line}\n`
    }
  }

  storeReview()

  return reviews
}
