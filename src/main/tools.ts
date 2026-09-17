import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createPatch } from 'diff'
import type { ToolPreview } from '../shared/types'
import { resolveInWorkspace, toWorkspaceRel } from '../shared/paths'
import { matchGlob } from '../shared/glob'

export interface ToolContext {
  workspace: string
}
export interface ToolResult {
  content: string
  isError: boolean
}

export const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'run_command'])

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  'release',
  '.next',
  '.vite',
  'coverage'
])
const MAX_READ = 200_000
const MAX_OUTPUT = 60_000

// Tool schemas in Anthropic Messages API format.
export const TOOL_SCHEMAS = [
  {
    name: 'list_dir',
    description:
      'List files and folders in a directory of the workspace. Use "." for the workspace root. Read-only.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Directory path relative to the workspace root.' } },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Read the full text contents of a file in the workspace. Read-only.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'File path relative to the workspace root.' } },
      required: ['path']
    }
  },
  {
    name: 'glob',
    description:
      'Find files whose workspace-relative path matches a glob pattern (supports **, *, ?). Read-only. Example: "src/**/*.ts".',
    input_schema: {
      type: 'object' as const,
      properties: { pattern: { type: 'string', description: 'Glob pattern.' } },
      required: ['pattern']
    }
  },
  {
    name: 'grep',
    description:
      'Search file contents for a JavaScript regular expression. Returns matching lines as path:line: text. Read-only.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'Optional file or directory to limit the search to.' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'write_file',
    description:
      'Create a new file or overwrite an existing file with the given content. Mutating: requires user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
        content: { type: 'string', description: 'Full new content of the file.' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description:
      'Replace an exact, unique substring in a file with new text. old_str must appear exactly once. Mutating: requires user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
        old_str: { type: 'string', description: 'Exact text to find (must be unique in the file).' },
        new_str: { type: 'string', description: 'Text to replace it with.' }
      },
      required: ['path', 'old_str', 'new_str']
    }
  },
  {
    name: 'run_command',
    description:
      'Run a shell command in the workspace directory and return its combined stdout/stderr and exit code. Mutating: requires user approval.',
    input_schema: {
      type: 'object' as const,
      properties: { command: { type: 'string', description: 'The shell command to run.' } },
      required: ['command']
    }
  }
]

function clip(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n… [truncated, ${s.length - max} more chars]`
}

async function walk(root: string, onFile: (abs: string) => void): Promise<void> {
  async function rec(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue
        await rec(path.join(dir, e.name))
      } else if (e.isFile()) {
        onFile(path.join(dir, e.name))
      }
    }
  }
  await rec(root)
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'list_dir':
        return await listDir(String(input.path ?? '.'), ctx)
      case 'read_file':
        return await readFile(String(input.path ?? ''), ctx)
      case 'glob':
        return await glob(String(input.pattern ?? ''), ctx)
      case 'grep':
        return await grep(String(input.pattern ?? ''), input.path ? String(input.path) : undefined, ctx)
      case 'write_file':
        return await writeFile(String(input.path ?? ''), String(input.content ?? ''), ctx)
      case 'edit_file':
        return await editFile(String(input.path ?? ''), String(input.old_str ?? ''), String(input.new_str ?? ''), ctx)
      case 'run_command':
        return await runCommand(String(input.command ?? ''), ctx)
      default:
        return { content: `Unknown tool: ${name}`, isError: true }
    }
  } catch (err) {
    return { content: (err as Error).message || String(err), isError: true }
  }
}

async function listDir(p: string, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveInWorkspace(ctx.workspace, p)
  const entries = await fs.readdir(abs, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name + '/')
  const files = entries.filter((e) => e.isFile()).map((e) => e.name)
  dirs.sort()
  files.sort()
  const lines = [...dirs, ...files]
  return { content: lines.length ? lines.join('\n') : '(empty directory)', isError: false }
}

async function readFile(p: string, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveInWorkspace(ctx.workspace, p)
  const buf = await fs.readFile(abs)
  let text = buf.toString('utf8')
  if (text.length > MAX_READ) text = text.slice(0, MAX_READ) + `\n… [truncated at ${MAX_READ} chars]`
  return { content: text, isError: false }
}

async function glob(pattern: string, ctx: ToolContext): Promise<ToolResult> {
  if (!pattern) return { content: 'No pattern provided.', isError: true }
  const matches: string[] = []
  await walk(ctx.workspace, (abs) => {
    const rel = toWorkspaceRel(ctx.workspace, abs)
    if (matchGlob(pattern, rel)) matches.push(rel)
  })
  matches.sort()
  const limited = matches.slice(0, 500)
  return {
    content: limited.length
      ? limited.join('\n') + (matches.length > limited.length ? `\n… (${matches.length - limited.length} more)` : '')
      : '(no matching files)',
    isError: false
  }
}

async function grep(pattern: string, scope: string | undefined, ctx: ToolContext): Promise<ToolResult> {
  let re: RegExp
  try {
    re = new RegExp(pattern)
  } catch (e) {
    return { content: `Invalid regex: ${(e as Error).message}`, isError: true }
  }
  const root = scope ? resolveInWorkspace(ctx.workspace, scope) : ctx.workspace
  const results: string[] = []
  const files: string[] = []
  const stat = await fs.stat(root).catch(() => null)
  if (stat?.isFile()) {
    files.push(root)
  } else {
    await walk(root, (abs) => files.push(abs))
  }
  outer: for (const abs of files) {
    let text: string
    try {
      const buf = await fs.readFile(abs)
      if (buf.includes(0)) continue // skip binary
      text = buf.toString('utf8')
    } catch {
      continue
    }
    const rel = toWorkspaceRel(ctx.workspace, abs)
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        results.push(`${rel}:${i + 1}: ${lines[i].slice(0, 300)}`)
        if (results.length >= 300) break outer
      }
    }
  }
  return { content: results.length ? clip(results.join('\n')) : '(no matches)', isError: false }
}

async function writeFile(p: string, content: string, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveInWorkspace(ctx.workspace, p)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return { content: `Wrote ${content.length} chars to ${toWorkspaceRel(ctx.workspace, abs)}`, isError: false }
}

async function editFile(p: string, oldStr: string, newStr: string, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveInWorkspace(ctx.workspace, p)
  const text = await fs.readFile(abs, 'utf8')
  if (oldStr === '') return { content: 'old_str is empty.', isError: true }
  const first = text.indexOf(oldStr)
  if (first === -1) return { content: `old_str not found in ${p}.`, isError: true }
  if (text.indexOf(oldStr, first + 1) !== -1) {
    return { content: `old_str is not unique in ${p}; include more surrounding context.`, isError: true }
  }
  const updated = text.slice(0, first) + newStr + text.slice(first + oldStr.length)
  await fs.writeFile(abs, updated, 'utf8')
  return { content: `Edited ${toWorkspaceRel(ctx.workspace, abs)}`, isError: false }
}

function runCommand(command: string, ctx: ToolContext): Promise<ToolResult> {
  return new Promise((resolve) => {
    if (!command.trim()) return resolve({ content: 'Empty command.', isError: true })
    const child = spawn(command, {
      cwd: ctx.workspace,
      shell: true,
      windowsHide: true
    })
    let out = ''
    const onData = (d: Buffer): void => {
      out += d.toString()
      if (out.length > MAX_OUTPUT * 2) child.kill()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = setTimeout(() => {
      child.kill()
      out += '\n… [killed: exceeded 120s timeout]'
    }, 120_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ content: clip(out.trim() || '(no output)') + `\n[exit code ${code}]`, isError: code !== 0 })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ content: `Failed to run: ${err.message}`, isError: true })
    })
  })
}

/** Build a human-readable preview shown in the approval prompt for a mutating tool. */
export function buildPreview(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): ToolPreview {
  if (name === 'run_command') {
    return { kind: 'command', title: 'Run command', body: String(input.command ?? '') }
  }
  if (name === 'write_file') {
    const p = String(input.path ?? '')
    const content = String(input.content ?? '')
    return { kind: 'write', title: `Write ${p}`, body: content.slice(0, 4000) }
  }
  if (name === 'edit_file') {
    const p = String(input.path ?? '')
    const oldStr = String(input.old_str ?? '')
    const newStr = String(input.new_str ?? '')
    let patch = ''
    try {
      patch = createPatch(p, oldStr, newStr, '', '')
    } catch {
      patch = `- ${oldStr}\n+ ${newStr}`
    }
    return { kind: 'diff', title: `Edit ${p}`, body: patch }
  }
  return { kind: 'generic', title: name, body: JSON.stringify(input, null, 2) }
}
