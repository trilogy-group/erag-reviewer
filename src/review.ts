import {Bot} from './bot'
import {Commenter} from './commenter'
import {info, warning, error} from '@actions/core'
import pLimit from 'p-limit'
import {Finding, PRContext, FileInfo, PullRequest, PRSummaryInput, FileBatch} from './types'
import {context as githubContext} from '@actions/github'
import {octokit} from './octokit'
import {Options} from './options'

const repo = githubContext.repo

const EXCLUDED_FILES = [
  // Package management
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  // Generated files
  '*.generated.*',
  '*.g.*',
  // Other
  '.DS_Store'
]

const MIN_BATCH_LINES = 100

// Main entry point
export async function codeReview(reviewBot: Bot): Promise<void> {
  const commenter = new Commenter()

  if (!isPullRequestEvent()) return
  const pullRequest = githubContext.payload.pull_request!

  // Step 1: Get PR changes and generate summary
  const files = await getChangedFiles(pullRequest)
  const prContext = await generatePRContext(reviewBot, files, pullRequest)

  // Step 2: Generate initial findings
  const findings = await generateFindings(reviewBot, prContext)

  // For testing locally
  if (process.env.NODE_ENV === 'test') {
    info(`Generated Findings:${JSON.stringify(findings, null, 2)}`)
    return
  }

  // Step 3: Validate and enhance findings
  const validatedFindings = await validateFindings(reviewBot, findings, prContext)

  // Step 4: Check for duplicates and existing discussions
  const newFindings = await filterDuplicateFindings(validatedFindings, pullRequest, commenter)

  // Step 5: Post review comments
  await postReviewComments(newFindings, pullRequest, commenter)
}

function isExcludedFile(filename: string): boolean {
  return EXCLUDED_FILES.some(pattern => {
    if (pattern.endsWith('/')) {
      return filename.startsWith(pattern)
    }
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
      return regex.test(filename)
    }
    return filename === pattern
  })
}

async function getChangedFiles(pullRequest: any): Promise<FileInfo[]> {
  const {data: files} = await octokit.pulls.listFiles({
    owner: repo.owner,
    repo: repo.repo,
    // eslint-disable-next-line camelcase
    pull_number: pullRequest.number
  })

  return files
    .filter(file => !isExcludedFile(file.filename))
    .map(file => ({
      filename: file.filename,
      patch: file.patch
    }))
}

async function generatePRContext(bot: Bot, files: FileInfo[], pullRequest: any): Promise<PRContext> {
  // Prepare summary input
  const summaryInput: PRSummaryInput = {
    title: pullRequest.title,
    description: pullRequest.body || '',
    changes: files.map(file => ({
      filename: file.filename,
      patch: file.patch || '',
      additions: file.patch?.match(/^\+/gm)?.length || 0,
      deletions: file.patch?.match(/^-/gm)?.length || 0
    }))
  }

  // Generate summary using Gemini
  const summary = await bot.summarizePR(summaryInput)

  return {
    title: pullRequest.title,
    description: pullRequest.body || '',
    summary,
    pullRequest,
    files
  }
}

function createFileBatches(files: FileInfo[]): FileBatch[] {
  const batches: FileBatch[] = []
  let currentBatch: FileBatch = {files: [], totalLines: 0}

  for (const file of files) {
    currentBatch.files.push(file)
    currentBatch.totalLines += file.patch?.split('\n').length || 0
    // Start a new batch if current batch exceeds MIN_BATCH_LINES
    if (currentBatch.totalLines > MIN_BATCH_LINES && currentBatch.files.length > 0) {
      batches.push(currentBatch)
      currentBatch = {files: [], totalLines: 0}
    }
  }

  // Add the last batch if it has any files
  if (currentBatch.files.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

async function generateFindings(bot: Bot, context: PRContext): Promise<Finding[]> {
  const files = await getChangedFiles(context.pullRequest)
  const batches = createFileBatches(files)

  // Use p-limit to run batches in parallel with a concurrency limit
  const limit = pLimit(10) // Process up to 10 batches at a time

  const batchPromises = batches.map(batch => limit(async () => bot.reviewBatch(context.summary, batch.files)))

  const batchResults = await Promise.all(batchPromises)
  return batchResults.flat()
}

async function validateFindings(bot: Bot, findings: Finding[], context: PRContext): Promise<Finding[]> {
  // TODO: Implement validation logic
  // For now, just return the findings as-is
  return findings
}

async function analyzeSymbols(symbols: string[]): Promise<string> {
  // TODO: Implement symbol analysis using codebase search
  return ''
}

async function validateFinding(bot: Bot, finding: Finding, symbolContext: string): Promise<boolean> {
  // TODO: Implement finding validation with symbol context
  return true
}

async function filterDuplicateFindings(findings: Finding[], pullRequest: PullRequest, commenter: Commenter): Promise<Finding[]> {
  const existingComments = await commenter.getExistingComments(pullRequest.number)

  return findings.filter(finding => {
    const key = `${finding.file}:${finding.lines?.start}-${finding.lines?.end}`
    return !existingComments.some(comment => comment.body.includes(finding.description) || comment.path === finding.file)
  })
}

async function postReviewComments(findings: Finding[], pullRequest: PullRequest, commenter: Commenter): Promise<void> {
  for (const finding of findings) {
    const comment = formatFindingComment(finding)
    if (finding.lines) {
      await commenter.createReviewComment(pullRequest.number, comment, finding.file, finding.lines.start)
    } else {
      await commenter.createIssueComment(pullRequest.number, comment)
    }
  }
}

function formatFindingComment(finding: Finding): string {
  const severity = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  }[finding.severity]

  let comment = `${severity} **Code Review Finding**\n\n${finding.description}\n\n`

  if (finding.suggestion) {
    comment += `**Suggestion:**\n${finding.suggestion}\n\n`
  }

  if (finding.symbolsUsed?.length) {
    comment += `**Related Symbols:**\n${finding.symbolsUsed.join(', ')}\n\n`
  }

  return comment
}

function isPullRequestEvent(): boolean {
  if (githubContext.eventName !== 'pull_request' && githubContext.eventName !== 'pull_request_target') {
    warning(`Skipped: current event is ${githubContext.eventName}, only support pull_request event`)
    return false
  }
  if (githubContext.payload.pull_request == null) {
    warning('Skipped: context.payload.pull_request is null')
    return false
  }
  return true
}

// Configure GitHub context for local testing
if (process.env.NODE_ENV === 'test') {
  Object.assign(githubContext, {
    eventName: 'pull_request',
    payload: {
      // eslint-disable-next-line camelcase
      pull_request: {
        number: 801,
        title: 'Test PR',
        body: 'Test PR description'
      }
    }
  })
  // For local testing with ts-node
  if (require.main === module) {
    const bot = new Bot({
      eragBaseUrl: 'https://erag.trilogy.com/api/v2',
      eragProjectName: 'STUDYREEL'
    } as Options)
    // eslint-disable-next-line github/no-then
    codeReview(bot).catch(error)
  }
}
/*
local run:
$env:NODE_ENV="test"
$env:GITHUB_ACTION="testaction"
$env:GITHUB_REPOSITORY="trilogy-group/crossover-client-extension"
$env:GITHUB_TOKEN="..."
$env:GOOGLE_API_KEY="..."
$env:ERAG_ACCESS_TOKEN="..."
npx tsx src/review.ts
*/
