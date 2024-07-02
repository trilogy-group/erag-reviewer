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
  eragLightModel: string
  eragHeavyModel: string
  eragModelTemperature: number
  eragRetries: number
  eragTimeoutMS: number
  eragConcurrencyLimit: number
  githubConcurrencyLimit: number
  lightTokenLimits: TokenLimits
  heavyTokenLimits: TokenLimits
  eragBaseUrl: string
  language: string

  constructor(
    debug: boolean,
    disableReview: boolean,
    disableReleaseNotes: boolean,
    maxFiles = '0',
    reviewSimpleChanges = false,
    reviewCommentLGTM = false,
    pathFilters: string[] | null = null,
    systemMessage = '',
    eragLightModel = 'gpt-4o',
    eragHeavyModel = 'gpt-4o',
    eragModelTemperature = '0.0',
    eragRetries = '3',
    eragTimeoutMS = '120000',
    eragConcurrencyLimit = '6',
    githubConcurrencyLimit = '6',
    eragBaseUrl = 'https://api.openai.com/v1',
    language = 'en-US'
  ) {
    this.debug = debug
    this.disableReview = disableReview
    this.disableReleaseNotes = disableReleaseNotes
    this.maxFiles = parseInt(maxFiles)
    this.reviewSimpleChanges = reviewSimpleChanges
    this.reviewCommentLGTM = reviewCommentLGTM
    this.pathFilters = new PathFilter(pathFilters)
    this.systemMessage = systemMessage
    this.eragLightModel = eragLightModel
    this.eragHeavyModel = eragHeavyModel
    this.eragModelTemperature = parseFloat(eragModelTemperature)
    this.eragRetries = parseInt(eragRetries)
    this.eragTimeoutMS = parseInt(eragTimeoutMS)
    this.eragConcurrencyLimit = parseInt(eragConcurrencyLimit)
    this.githubConcurrencyLimit = parseInt(githubConcurrencyLimit)
    this.lightTokenLimits = new TokenLimits(eragLightModel)
    this.heavyTokenLimits = new TokenLimits(eragHeavyModel)
    this.eragBaseUrl = eragBaseUrl
    this.language = language
  }

  // print all options using core.info
  print(): void {
    info(`debug: ${this.debug}`)
    info(`disable_review: ${this.disableReview}`)
    info(`disable_release_notes: ${this.disableReleaseNotes}`)
    info(`max_files: ${this.maxFiles}`)
    info(`review_simple_changes: ${this.reviewSimpleChanges}`)
    info(`review_comment_lgtm: ${this.reviewCommentLGTM}`)
    info(`path_filters: ${this.pathFilters}`)
    info(`system_message: ${this.systemMessage}`)
    info(`erag_light_model: ${this.eragLightModel}`)
    info(`erag_heavy_model: ${this.eragHeavyModel}`)
    info(`erag_model_temperature: ${this.eragModelTemperature}`)
    info(`erag_retries: ${this.eragRetries}`)
    info(`erag_timeout_ms: ${this.eragTimeoutMS}`)
    info(`erag_concurrency_limit: ${this.eragConcurrencyLimit}`)
    info(`github_concurrency_limit: ${this.githubConcurrencyLimit}`)
    info(`summary_token_limits: ${this.lightTokenLimits.string()}`)
    info(`review_token_limits: ${this.heavyTokenLimits.string()}`)
    info(`erag_base_url: ${this.eragBaseUrl}`)
    info(`language: ${this.language}`)
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

export class OpenAIOptions {
  model: string
  tokenLimits: TokenLimits

  constructor(model = 'gpt-3.5-turbo', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}
