const STORAGE_KEYS = {
  GITHUB_PAT: 'github_pat',
} as const

export function getGitHubPAT(): string | null {
  return localStorage.getItem(STORAGE_KEYS.GITHUB_PAT)
}

export function setGitHubPAT(token: string): void {
  localStorage.setItem(STORAGE_KEYS.GITHUB_PAT, token)
}

export function removeGitHubPAT(): void {
  localStorage.removeItem(STORAGE_KEYS.GITHUB_PAT)
}
