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
    if (!message) {
      return ''
    }

    if (!this.api) {
      setFailed('The ERAG API is not initialized')
      return ''
    }

    const start = Date.now()
    let response: string = ''
    try {
      if (this.options.debug) {
        info(`Sending message to erag:\n\n ${message}\n\n`)
      }

      response = await pRetry(() => this.api!.sendMessage(message), {
        retries: this.options.eragRetries
      })

      if (this.options.debug) {
        info(`Received response from erag:\n\n ${response}\n\n`)
      }
    } catch (e: any) {
      info(
        `Failed to send message to erag: ${e.message}, backtrace: ${e.stack}`
      )
    }
    const end = Date.now()
    info(
      `erag sendMessage (including retries) response time: ${end - start} ms`
    )

    return response
  }
}
