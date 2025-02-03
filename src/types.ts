export interface Finding {
  file: string
  message: string
  suggestion?: string
  lines?: {
    start: number
    end: number
  }
  severity: 'error' | 'warning' | 'info'
}

export interface PRContext {
  title: string
  description: string
  summary: string
  pullRequest: any // TODO: Define proper type
  files: FileInfo[]
}

export interface FileInfo {
  filename: string
  patch?: string
  additions?: number
  deletions?: number
}

export interface PullRequest {
  number: number
  title: string
  body?: string
}

export interface PRSummaryInput {
  title: string
  description: string
  changes: {
    filename: string
    patch: string
    additions: number
    deletions: number
  }[]
}

export interface FileBatch {
  files: FileInfo[]
  totalLines: number
}
