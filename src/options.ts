import {getBooleanInput, getInput, getMultilineInput} from '@actions/core'
import {TokenLimits} from './limits'
import {PathFilter} from './pathFilter'

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
  eragBaseUrl: string
  eragProjectName: string
  tokenLimits: TokenLimits

  constructor() {
    this.debug = getBooleanInput('debug')
    this.disableReview = getBooleanInput('disable_review')
    this.disableReleaseNotes = getBooleanInput('disable_release_notes')
    this.maxFiles = parseInt(getInput('max_files'))
    this.reviewSimpleChanges = getBooleanInput('review_simple_changes')
    this.reviewCommentLGTM = getBooleanInput('review_comment_lgtm')
    this.pathFilters = new PathFilter(getMultilineInput('path_filters'))
    this.systemMessage = getInput('system_message')
    this.model = getInput('model')
    this.eragRetries = parseInt(getInput('erag_retries'))
    this.eragConcurrencyLimit = parseInt(getInput('erag_concurrency_limit'))
    this.githubConcurrencyLimit = parseInt(getInput('github_concurrency_limit'))
    this.eragBaseUrl = getInput('erag_base_url')
    this.eragProjectName = getInput('erag_project_name')

    this.tokenLimits = new TokenLimits(this.model)
  }

  toString(): string {
    let result = 'Options:\n'
    const separator = `${'-'.repeat(20)}\n`

    for (const [key, value] of Object.entries(this)) {
      result += `${key}: ${value}\n${separator}`
    }

    return result.trimEnd()
  }
}
