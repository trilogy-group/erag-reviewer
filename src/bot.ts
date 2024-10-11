import './fetch-polyfill'

import {info, error, setFailed, warning} from '@actions/core'
import pRetry from 'p-retry'
import {Options} from './options'
import {EragAPI} from './erag'

export class Bot {
  private readonly api: EragAPI | null = null

  private readonly options: Options

  constructor(options: Options) {
    this.options = options
    if (process.env.ERAG_ACCESS_TOKEN) {
      this.api = new EragAPI(options.eragBaseUrl, options.model, options.eragProjectName, process.env.ERAG_ACCESS_TOKEN)
    } else {
      const err = "Unable to initialize the ERAG API, 'ERAG_ACCESS_TOKEN' environment variable is not available"
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
        info('::group::Sending message to erag')
        info(`\n\n ${message}\n\n`)
        info('::endgroup::')
      }

      response = await pRetry(() => this.api!.sendMessage(message), {
        retries: this.options.eragRetries
      })

      if (this.options.debug) {
        info('::group::Received response from erag')
        info(`\n\n ${response}\n\n`)
        info('::endgroup::')
      }
    } catch (err: any) {
      error(`Failed to send message to erag: ${err}`)
    }
    const end = Date.now()
    info(`erag sendMessage (including retries) response time: ${end - start} ms`)

    return response
  }
}
