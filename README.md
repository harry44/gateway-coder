# Gateway Coder

A Windows desktop coding agent (Claude-Code-style) for the company LiteLLM
gateway. Configure your gateway key, open a workspace folder, and chat — the
agent can read, search, write, and edit files and run commands in that folder,
with every mutating action gated behind your approval.

## Requirements
- Windows 10/11
- Node.js 18+ (uses prebuilt Electron; no native compilers needed)
- A personal gateway key (`sk-…`) from the administrator

## Develop
```bash
npm install
npm run dev
```
On first launch, open Settings (⚙) and either paste your `sk-…` key or click
**Import from gw.json** (reads `~/.claude/gw.json`). Use **Test connection** to
verify. Then **Open folder** to choose a workspace and start chatting.

## Test
```bash
npm test
```

## Build a Windows installer
```bash
npm run package
```
The installer is written to `release/`.

## How it works
- **Main process** holds the gateway key (encrypted at rest via Windows DPAPI),
  runs the agent loop against the Anthropic Messages API, executes tools, and
  gates writes/commands behind approval. The key never reaches the UI.
- **Renderer** is a React chat UI with tool-call cards, diffs, and inline
  Approve/Reject.
- File tools are sandboxed to the chosen workspace folder; `run_command` runs
  with the workspace as its working directory.

See `SPEC.md` for the full design.

## Models
Preloaded with the gateway models (exact `·` spelling — a wrong character is a
403). Edit the list any time in Settings.
