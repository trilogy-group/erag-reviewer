import {info, setFailed, warning} from '@actions/core'
import {Bot} from './bot'
import {Options} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'
import {handleReviewComment} from './review-comment'

async function run(): Promise<void> {
  let options: Options
  let prompts: Prompts
  let reviewBot: Bot

  try {
    options = new Options()
    info(options.toString())
  } catch (e: any) {
    setFailed(`Failed to create options: ${e}, backtrace: ${e.stack}`)
    return
  }

  try {
    prompts = new Prompts()
  } catch (e: any) {
    setFailed(`Failed to create prompts: ${e}, backtrace: ${e.stack}`)
    return
  }

  try {
    reviewBot = new Bot(options)
  } catch (e: any) {
    setFailed(
      `Failed to create review bot, please check your erag service user credentials: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await codeReview(reviewBot, options, prompts)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(reviewBot, options, prompts)
    } else {
      warning('Skipped: this action only works on push events or pull_request')
    }
  } catch (e: any) {
    if (e instanceof Error) {
      setFailed(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
    } else {
      setFailed(`Failed to run: ${e}, backtrace: ${e.stack}`)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
