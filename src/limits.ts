export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number
  knowledgeCutOff: string

  constructor(model = 'gpt-3.5-turbo') {
    this.knowledgeCutOff = '2023-10-01'
    if (model === 'gpt-4-32k') {
      this.maxTokens = 32600
      this.responseTokens = 4000
    } else if (model === 'gpt-3.5-turbo-16k') {
      this.maxTokens = 16300
      this.responseTokens = 3000
    } else if (model === 'gpt-4') {
      this.maxTokens = 8000
      this.responseTokens = 2000
    } else if (model === 'gpt-4o') {
      // gpt-4o has 128k token size but we set to 32k for now
      this.maxTokens = 32600
      this.responseTokens = 4000
    } else if (model === 'bedrock-claude3.5-sonnet') {
      this.maxTokens = 16000
      this.responseTokens = 4000
    } else if (model.includes('o1-mini') {
      this.maxTokens = 128000
      this.responseTokens = 65000
    } else {
      this.maxTokens = 4000
      this.responseTokens = 1000
    }
    // provide some margin for the request tokens
    this.requestTokens = this.maxTokens - this.responseTokens - 100
  }

  toString(): string {
    return JSON.stringify(
      Object.fromEntries(Object.entries(this).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value) : value])),
      null,
      2
    )
  }
}
