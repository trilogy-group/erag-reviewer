import axios from 'axios'

export class EragAPI {
  private model: string
  private projectName: string
  private apiUrl: string

  constructor(apiUrl: string, model: string, projectName: string) {
    this.model = model
    this.projectName = projectName
    this.apiUrl = apiUrl
  }

  async sendMessage(query: string): Promise<string> {
    try {
      const queryEndpoint = `${this.apiUrl}/ai/query`
      const response = await axios.post(queryEndpoint, {
        query,
        model: this.model,
        // eslint-disable-next-line camelcase
        project_name: this.projectName
      })

      return response.data.response.text
    } catch (error) {
      throw new Error(`Failed to send message: ${(error as Error).message}`)
    }
  }
}
