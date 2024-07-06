import './fetch-polyfill'

import {info, setFailed, warning} from '@actions/core'
import pRetry from 'p-retry'
import {Options} from './options'
import {EragAPI} from './erag'

export class Bot {
  private readonly api: EragAPI | null = null

  private readonly options: Options

  constructor(options: Options) {
    this.options = options
    if (process.env.ERAG_ACCESS_TOKEN) {
      this.api = new EragAPI(
        options.eragBaseUrl,
        options.model,
        options.eragProjectName,
        process.env.ERAG_ACCESS_TOKEN
      )
    } else {
      const err =
        "Unable to initialize the ERAG API, 'ERAG_ACCESS_TOKEN' environment variable is not available"
      throw new Error(err)
    }
  }

  chat = async (message: string): Promise<string> => {
    let res: string = ''
    try {
      res = await this.chat_(message)
      return res
    } catch (e: any) {
      warning(`Failed to chat: ${e.message}, backtrace: ${e.stack}`)
      return res
    }
  }

  private readonly chat_ = async (message: string): Promise<string> => {
    // record timing
    const start = Date.now()
    if (!message) {
      return ''
    }

    let response: string = ''

    if (this.api != null) {
      try {
        response = await pRetry(() => this.api!.sendMessage(message), {
          retries: this.options.eragRetries
        })
      } catch (e: any) {
        info(
          `response: ${response}, failed to send message to erag: ${e.message}, backtrace: ${e.stack}`
        )
      }
      const end = Date.now()
      info(`response: ${JSON.stringify(response)}`)
      info(
        `erag sendMessage (including retries) response time: ${end - start} ms`
      )
    } else {
      setFailed('The ERAG API is not initialized')
    }
    if (!response) {
      warning('erag response is null')
    }
    if (this.options.debug) {
      info(`erag responses: ${response}`)
    }
    return response
  }
}
