import {setFailed} from '@actions/core'
import axios, {isAxiosError} from 'axios'

export class EragAPI {
  private model: string
  private projectName: string
  private apiUrl: string
  private accessToken: string

  constructor(
    apiUrl: string,
    model: string,
    projectName: string,
    accessToken: string
  ) {
    this.model = model
    this.projectName = projectName
    this.apiUrl = apiUrl
    this.accessToken = accessToken
  }

  async sendMessage(query: string): Promise<string> {
    try {
      const queryEndpoint = `${this.apiUrl}/ai/query`
      const response = await axios.post(
        queryEndpoint,
        {
          query,
          model: this.model,
          // eslint-disable-next-line camelcase
          project_name: this.projectName
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        }
      )

      if (response.data.error) {
        throw new Error(response.data.error)
      }

      return response.data.response.text
    } catch (error: any) {
      if (isAxiosError(error) && error.response?.status === 403) {
        setFailed('Unauthorized: Please check your ERAG_ACCESS_TOKEN')
      }
      throw new Error(error)
    }
  }
}
