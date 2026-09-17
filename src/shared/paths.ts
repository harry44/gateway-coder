import path from 'node:path'

/**
 * Resolve a user/model-supplied path against the workspace root, guaranteeing the
 * result stays inside the workspace. Throws if the path escapes the root.
 * Pure (only uses node:path) so it can be unit-tested without Electron.
 */
export function resolveInWorkspace(workspace: string, p: string): string {
  if (!workspace) throw new Error('No workspace folder is open.')
  const abs = path.resolve(workspace, p)
  const rel = path.relative(workspace, abs)
  if (rel === '') return abs // the workspace root itself
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${p}" escapes the workspace folder.`)
  }
  return abs
}

/** Path relative to the workspace, using forward slashes, for display. */
export function toWorkspaceRel(workspace: string, abs: string): string {
  return path.relative(workspace, abs).replace(/\\/g, '/')
}
