import {info, warning, error} from '@actions/core'
import {EragAPI} from './erag'
import {type Options} from './options'
import {ChatGoogleGenerativeAI} from '@langchain/google-genai'
import {PromptTemplate} from '@langchain/core/prompts'
import {StringOutputParser} from '@langchain/core/output_parsers'
import {Finding, FileInfo, PRSummaryInput} from './types'

const PR_SUMMARY_TEMPLATE = `You are a code review assistant. Analyze this pull request and provide a clear, concise summary. This summary will be provided as a comment on the pull request and also used for context during the code review.

Title: {title}
Description: {description}

Changes:
{changes}

Provide a summary covering:
1. The main purpose of the changes
2. Key components modified
3. Notable implementation details
4. Anything specific that the code reviewer should pay special attention to

Keep the summary focused and technical. Don't include code snippets, pleasantries, or unnecessary text.`

const REVIEW_TEMPLATE = `You are a code review assistant. Analyze the following changes and provide specific, actionable feedback.

Title: {title}
Description: {description}

PR Summary:
{summary}

Changes to Review:
{files}

For each potential issue found, provide:
1. A clear description of the concern. Don't include code snippets, only explain the issue and a potential solution in a few sentences.
2. The specific file and location
3. Any symbols (functions, classes, variables) that are relevant to the issue

IMPORTANT: Your response MUST be a valid JSON array of findings, each with these fields:
- description: string (clear explanation of the issue)
- file: string (full file path as appears in the input)
- lines?: { start: number, end: number } (location of the issue in the updated file)

Example response format:
[
  {
    "description": "The error handling could be improved by logging the error message.",
    "file": "src/handler.ts",
    "lines": { "start": 15, "end": 20 }
  }
]

If there are no issues found, return an empty array.

Focus on:
- Potential bugs, regressions
- Maintainability issues
- Performance issues
- Simplification opportunities (less code lines the better)

Keep suggestions specific and actionable. Don't include general comments about coding style unless they impact maintainability.`

export class Bot {
  private readonly api: EragAPI
  private readonly gemini: ChatGoogleGenerativeAI

  constructor(options: Options) {
    // Initialize Gemini
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("Unable to initialize Gemini, 'GOOGLE_API_KEY' environment variable is not available")
    }
    if (!process.env.ERAG_ACCESS_TOKEN) {
      throw new Error("Unable to initialize the ERAG API, 'ERAG_ACCESS_TOKEN' environment variable is not available")
    }

    this.gemini = new ChatGoogleGenerativeAI({
      modelName: 'gemini-1.5-flash-latest',
      maxOutputTokens: 1000,
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: 0.4
    })

    // Initialize ERAG
    this.api = new EragAPI(options.eragBaseUrl, 'bedrock-claude3.5-sonnet', options.eragProjectName, process.env.ERAG_ACCESS_TOKEN)
  }

  async reviewBatch(summary: string, files: FileInfo[]): Promise<Finding[]> {
    try {
      const prompt = REVIEW_TEMPLATE.replace('{summary}', summary).replace(
        '{files}',
        files.map(file => `File: ${file.filename}\nPatch:\n${file.patch}`).join('\n---\n')
      )

      const response = await this.api.sendMessage(prompt)
      try {
        // Extract JSON array from response using regex
        const match = response.match(/\[.*\]/s)
        if (!match) {
          error(`No JSON array found in response: ${response}`)
          throw new Error('No JSON array found in response')
        }
        return JSON.parse(match[0]) as Finding[]
      } catch (parseError) {
        error(`Failed to parse response as JSON: ${response}`)
        throw new Error(`Invalid JSON response: ${parseError}`)
      }
    } catch (e) {
      throw new Error(`Failed to review batch: ${e}`)
    }
  }

  async summarizePR(input: PRSummaryInput): Promise<string> {
    try {
      // Create and run the chain
      const prompt = PromptTemplate.fromTemplate(PR_SUMMARY_TEMPLATE)
      const chain = prompt.pipe(this.gemini).pipe(new StringOutputParser())

      const summary = await chain.invoke({
        title: input.title,
        description: input.description,
        changes: input.changes.map(change => `File: ${change.filename}\nPatch:\n${change.patch}`).join('\n---\n')
      })

      info(`Generated PR Summary: ${summary}`)
      return summary
    } catch (e: any) {
      warning(`Failed to generate PR summary: ${e.message}, backtrace: ${e.stack}`)
      throw e
    }
  }
}
