# Gateway Coder — Design Spec

A Windows desktop **coding agent** (like Claude Code) that talks to the company
LiteLLM gateway. Configure a gateway key, open a workspace folder, chat, and let
the agent read/write files and run commands in that folder — every mutating
action gated by your approval.

## Gateway facts (from QUICKSTART-gateway.pdf)
- Anthropic-compatible endpoint: `https://litellm.myrent.it`
- Auth: personal `sk-…` key, sent as `Authorization: Bearer` (Claude Code's `ANTHROPIC_AUTH_TOKEN`)
- Models (exact `·` spelling — one wrong char = 403):
  | Shown | Sent | $/1M in–out |
  |---|---|---|
  | DeepSeek V4 Flash | `DeepSeek · V4 Flash` | 0.10 / 0.20 |
  | DeepSeek V4 Pro (default) | `DeepSeek · V4 Pro` | 0.44 / 0.87 |
  | Z.AI GLM 5.1 | `Z.AI · GLM 5.1` | 0.98 / 3.08 |
  | Anthropic Claude Sonnet 5 | `Anthropic · Claude Sonnet 5` | 3.00 / 15.00 |
  | Google Gemini 3.1 Flash Lite | `Google · Gemini 3.1 Flash Lite` | — |

## Stack
Electron + React + TypeScript, built with electron-vite, packaged with
electron-builder (Windows NSIS). Anthropic Messages API via `@anthropic-ai/sdk`
(tool use). All pure-JS deps — no native builds.

## Architecture
- **Main (Node)** — owns secret + filesystem + shell. Runs the agent loop, executes
  tools, gates mutating tools behind renderer approval, persists conversations.
  Key stored via Electron `safeStorage` (Windows DPAPI); never leaves main.
- **Preload** — typed `window.api` bridge (contextIsolation on, nodeIntegration off).
- **Renderer (React)** — sidebar (workspace picker + conversations), chat timeline
  with tool-call cards, diffs, inline Approve/Reject, model dropdown, settings.

## Agent loop
`messages.stream({ model, tools, system, messages })` → stream text → on
`stop_reason: tool_use`, for each `tool_use` block: request approval if mutating,
execute, append `tool_result`, loop. Stops on `end_turn` or `maxSteps`.

## Tools
- `list_dir`, `read_file`, `glob`, `grep` — read-only, auto-run
- `write_file`, `edit_file` (unique-match replace, shown as diff), `run_command`
  (shell at workspace cwd) — **mutating, require approval**
- All fs paths sandboxed to the workspace root; `run_command` runs with cwd = workspace.

## Persistence & security
- Conversations: one JSON per chat in userData (raw Anthropic messages = source of truth).
- Settings: baseUrl, models, selectedModel, maxTokens, maxSteps, auto-approve flags.
- Key encrypted at rest; masked in UI; never logged. Import from `~/.claude/gw.json`.

## Testing
vitest unit tests for pure logic: cost calc, gw.json parse, glob→regex,
workspace path sandboxing, messages↔timeline conversion. Manual smoke test of a
live agent turn against the gateway.
