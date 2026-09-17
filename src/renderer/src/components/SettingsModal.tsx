import { useState } from 'react'
import type { ModelDef, SettingsView } from '../../../shared/types'

interface Props {
  settings: SettingsView
  onClose: () => void
  onApply: (next: SettingsView) => void
}

export default function SettingsModal({ settings, onClose, onApply }: Props): JSX.Element {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [keyInput, setKeyInput] = useState('')
  const [models, setModels] = useState<ModelDef[]>(settings.models)
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens)
  const [maxSteps, setMaxSteps] = useState(settings.maxSteps)
  const [autoApprove, setAutoApprove] = useState(settings.autoApprove)
  const [requireApprovalForReads, setReqReads] = useState(settings.requireApprovalForReads)
  const [toolApprovals, setToolApprovals] = useState<Record<string, 'ask' | 'allow' | 'always'>>(settings.toolApprovals ?? {})
  const [hasKey, setHasKey] = useState(settings.hasKey)
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const updateModel = (i: number, patch: Partial<ModelDef>): void => {
    setModels((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }
  const removeModel = (i: number): void => setModels((ms) => ms.filter((_, idx) => idx !== i))
  const addModel = (): void =>
    setModels((ms) => [...ms, { label: 'New model', value: '', inputPerM: null, outputPerM: null }])

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      if (keyInput.trim()) {
        await window.api.setKey(keyInput.trim())
        setHasKey(true)
        setKeyInput('')
      }
      const cleanModels = models.filter((m) => m.value.trim())
      const next = await window.api.saveSettings({
        baseUrl: baseUrl.trim(),
        models: cleanModels,
        maxTokens: Number(maxTokens) || 4096,
        maxSteps: Number(maxSteps) || 25,
        autoApprove,
        requireApprovalForReads,
        toolApprovals
      })
      onApply(next)
      setStatus('Saved.')
    } finally {
      setBusy(false)
    }
  }

  const importGw = async (): Promise<void> => {
    setBusy(true)
    setStatus('')
    try {
      const res = await window.api.importGw()
      if (!res.ok) {
        setStatus(res.message ?? 'Import failed.')
      } else if (res.settings) {
        setBaseUrl(res.settings.baseUrl)
        setHasKey(res.settings.hasKey)
        onApply(res.settings)
        setStatus('Imported from ~/.claude/gw.json.')
      }
    } finally {
      setBusy(false)
    }
  }

  const testConn = async (): Promise<void> => {
    setBusy(true)
    setStatus('Testing…')
    try {
      // Persist current base URL + key first so the test uses them.
      if (keyInput.trim()) {
        await window.api.setKey(keyInput.trim())
        setHasKey(true)
        setKeyInput('')
      }
      await window.api.saveSettings({ baseUrl: baseUrl.trim() })
      const res = await window.api.testGateway()
      setStatus(res.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>Gateway Base URL</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
          </label>

          <label className="field">
            <span>Gateway Key {hasKey ? '(saved — leave blank to keep)' : '(required)'}</span>
            <input
              type="password"
              value={keyInput}
              placeholder={hasKey ? '•••••••••• saved' : 'sk-…'}
              onChange={(e) => setKeyInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <div className="row-btns">
            <button className="btn" onClick={importGw} disabled={busy} type="button">
              Import from gw.json
            </button>
            <button className="btn" onClick={testConn} disabled={busy} type="button">
              Test connection
            </button>
          </div>

          <div className="models-editor">
            <div className="models-head">
              <span>Models</span>
              <button className="btn small" onClick={addModel} type="button">
                + Add
              </button>
            </div>
            <div className="models-cols">
              <span>Label</span>
              <span>Sent to gateway (keep the ·)</span>
              <span>$in</span>
              <span>$out</span>
              <span />
            </div>
            {models.map((m, i) => (
              <div className="model-row" key={i}>
                <input value={m.label} onChange={(e) => updateModel(i, { label: e.target.value })} />
                <input
                  value={m.value}
                  onChange={(e) => updateModel(i, { value: e.target.value })}
                  spellCheck={false}
                  className={m.value && !m.value.includes('·') ? 'warn' : ''}
                />
                <input
                  type="number"
                  step="0.01"
                  value={m.inputPerM ?? ''}
                  onChange={(e) => updateModel(i, { inputPerM: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <input
                  type="number"
                  step="0.01"
                  value={m.outputPerM ?? ''}
                  onChange={(e) => updateModel(i, { outputPerM: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <button className="icon-btn" onClick={() => removeModel(i)} type="button">
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="grid2">
            <label className="field">
              <span>Max tokens / reply</span>
              <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Max agent steps / turn</span>
              <input type="number" value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} />
            </label>
          </div>

          <label className="check">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            <span>Auto-approve edits &amp; commands (skip prompts) — use with care</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={requireApprovalForReads}
              onChange={(e) => setReqReads(e.target.checked)}
            />
            <span>Also require approval for read-only tools</span>
          </label>

          <div className="tool-approvals-editor">
            <div className="models-head">
              <span>Tool Approvals</span>
              <span className="hint">Default: Ask</span>
            </div>
            <div className="models-cols tool-approval-cols">
              <span>Tool</span>
              <span>Behavior</span>
              <span />
            </div>
            {(['list_dir', 'read_file', 'glob', 'grep', 'write_file', 'edit_file', 'run_command'] as const).map((tool) => (
              <div className="model-row" key={tool}>
                <span className="tool-name-label">{tool}</span>
                <select
                  value={toolApprovals[tool] ?? 'ask'}
                  onChange={(e) => setToolApprovals({ ...toolApprovals, [tool]: e.target.value as 'ask' | 'allow' | 'always' })}
                  className="tool-approval-select"
                >
                  <option value="ask">Ask each time</option>
                  <option value="allow">Allow once</option>
                  <option value="always">Always allow</option>
                </select>
                <span />
              </div>
            ))}
          </div>

          {status && <div className="settings-status">{status}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} type="button">
            Close
          </button>
          <button className="btn primary" onClick={save} disabled={busy} type="button">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
