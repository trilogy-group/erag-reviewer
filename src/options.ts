import {info} from '@actions/core'
import {minimatch} from 'minimatch'
import {TokenLimits} from './limits'

export class Options {
  debug: boolean
  disableReview: boolean
  disableReleaseNotes: boolean
  maxFiles: number
  reviewSimpleChanges: boolean
  reviewCommentLGTM: boolean
  pathFilters: PathFilter
  systemMessage: string
  model: string
  eragRetries: number
  eragConcurrencyLimit: number
  githubConcurrencyLimit: number
  tokenLimits: TokenLimits
  eragBaseUrl: string
  eragProjectName: string

  constructor(
    debug: boolean,
    disableReview: boolean,
    disableReleaseNotes: boolean,
    maxFiles = '0',
    reviewSimpleChanges = false,
    reviewCommentLGTM = false,
    pathFilters: string[] | null = null,
    systemMessage = '',
    model = 'gpt-4o',
    eragRetries = '3',
    eragConcurrencyLimit = '6',
    githubConcurrencyLimit = '6',
    eragBaseUrl = 'https://erag.trilogy.com/api/v2',
    eragProjectName = ''
  ) {
    this.debug = debug
    this.disableReview = disableReview
    this.disableReleaseNotes = disableReleaseNotes
    this.maxFiles = parseInt(maxFiles)
    this.reviewSimpleChanges = reviewSimpleChanges
    this.reviewCommentLGTM = reviewCommentLGTM
    this.pathFilters = new PathFilter(pathFilters)
    this.systemMessage = systemMessage
    this.model = model
    this.eragRetries = parseInt(eragRetries)
    this.eragConcurrencyLimit = parseInt(eragConcurrencyLimit)
    this.githubConcurrencyLimit = parseInt(githubConcurrencyLimit)
    this.tokenLimits = new TokenLimits(model)
    this.eragBaseUrl = eragBaseUrl
    this.eragProjectName = eragProjectName
  }

  // print all options using core.info
  print(): void {
    info('Printing options\n\n')

    info(`debug: ${this.debug}`)
    info(`disable_review: ${this.disableReview}`)
    info(`disable_release_notes: ${this.disableReleaseNotes}`)
    info(`max_files: ${this.maxFiles}`)
    info(`review_simple_changes: ${this.reviewSimpleChanges}`)
    info(`review_comment_lgtm: ${this.reviewCommentLGTM}`)
    info(`path_filters: ${this.pathFilters}`)
    info(`system_message: ${this.systemMessage}`)
    info(`model: ${this.model}`)
    info(`erag_retries: ${this.eragRetries}`)
    info(`erag_concurrency_limit: ${this.eragConcurrencyLimit}`)
    info(`github_concurrency_limit: ${this.githubConcurrencyLimit}`)
    info(`token_limits: ${this.tokenLimits.string()}`)
    info(`erag_base_url: ${this.eragBaseUrl}`)
    info(`erag_project_name: ${this.eragProjectName}`)

    info('\n\n')
  }

  checkPath(path: string): boolean {
    const ok = this.pathFilters.check(path)
    info(`checking path: ${path} => ${ok}`)
    return ok
  }
}

export class PathFilter {
  private readonly rules: Array<[string /* rule */, boolean /* exclude */]>

  constructor(rules: string[] | null = null) {
    this.rules = []
    if (rules != null) {
      for (const rule of rules) {
        const trimmed = rule?.trim()
        if (trimmed) {
          if (trimmed.startsWith('!')) {
            this.rules.push([trimmed.substring(1).trim(), true])
          } else {
            this.rules.push([trimmed, false])
          }
        }
      }
    }
  }

  check(path: string): boolean {
    if (this.rules.length === 0) {
      return true
    }

    let included = false
    let excluded = false
    let inclusionRuleExists = false

    for (const [rule, exclude] of this.rules) {
      if (minimatch(path, rule)) {
        if (exclude) {
          excluded = true
        } else {
          included = true
        }
      }
      if (!exclude) {
        inclusionRuleExists = true
      }
    }

    return (!inclusionRuleExists || included) && !excluded
  }
}
