export class Inputs {
  systemMessage: string
  title: string
  description: string
  rawSummary: string
  shortSummary: string
  filename: string
  fileContent: string
  fileDiff: string
  patches: string
  diff: string
  commentChain: string
  comment: string
  symbolSearchResults: string

  constructor(
    systemMessage = '',
    title = 'no title provided',
    description = 'no description provided',
    rawSummary = '',
    shortSummary = '',
    filename = '',
    fileContent = 'file contents cannot be provided',
    fileDiff = 'file diff cannot be provided',
    patches = '',
    diff = 'no diff',
    commentChain = 'no other comments on this patch',
    comment = 'no comment provided',
    symbolSearchResults = ''
  ) {
    this.systemMessage = systemMessage
    this.title = title
    this.description = description
    this.rawSummary = rawSummary
    this.shortSummary = shortSummary
    this.filename = filename
    this.fileContent = fileContent
    this.fileDiff = fileDiff
    this.patches = patches
    this.diff = diff
    this.commentChain = commentChain
    this.comment = comment
    this.symbolSearchResults = symbolSearchResults
  }

  clone(): Inputs {
    return new Inputs(
      this.systemMessage,
      this.title,
      this.description,
      this.rawSummary,
      this.shortSummary,
      this.filename,
      this.fileContent,
      this.fileDiff,
      this.patches,
      this.diff,
      this.commentChain,
      this.comment,
      this.symbolSearchResults
    )
  }

  render(content: string): string {
    if (!content) {
      return ''
    }
    if (this.systemMessage) {
      content = content.replace('$system_message', this.systemMessage)
    }
    if (this.title) {
      content = content.replace('$title', this.title)
    }
    if (this.description) {
      content = content.replace('$description', this.description)
    }
    if (this.rawSummary) {
      content = content.replace('$raw_summary', this.rawSummary)
    }
    if (this.shortSummary) {
      content = content.replace('$short_summary', this.shortSummary)
    }
    if (this.filename) {
      content = content.replace('$filename', this.filename)
    }
    if (this.fileContent) {
      content = content.replace('$file_content', this.fileContent)
    }
    if (this.fileDiff) {
      content = content.replace('$file_diff', this.fileDiff)
    }
    if (this.patches) {
      content = content.replace('$patches', this.patches)
    }
    if (this.diff) {
      content = content.replace('$diff', this.diff)
    }
    if (this.commentChain) {
      content = content.replace('$comment_chain', this.commentChain)
    }
    if (this.comment) {
      content = content.replace('$comment', this.comment)
    }
    if (this.symbolSearchResults) {
      content = content.replace('$symbol_search_results', this.symbolSearchResults)
    }
    return content
  }
}
