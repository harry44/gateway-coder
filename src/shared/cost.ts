import type { ModelDef, Usage } from './types'
import { findModel } from './models'

/** Cost in USD for a given usage against a model, or null if pricing unknown. */
export function computeCost(
  models: ModelDef[],
  modelValue: string,
  usage: Usage | undefined
): number | null {
  if (!usage) return null
  const m = findModel(models, modelValue)
  if (!m || m.inputPerM == null || m.outputPerM == null) return null
  const input = (usage.input_tokens / 1_000_000) * m.inputPerM
  const output = (usage.output_tokens / 1_000_000) * m.outputPerM
  return input + output
}

/** Format a USD amount with sensible precision for small values. */
export function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return '—'
  if (amount === 0) return '$0.00'
  if (amount < 0.01) return '<$0.01'
  return '$' + amount.toFixed(amount < 1 ? 3 : 2)
}

export function addUsage(a: Usage | undefined, b: Usage | undefined): Usage {
  return {
    input_tokens: (a?.input_tokens ?? 0) + (b?.input_tokens ?? 0),
    output_tokens: (a?.output_tokens ?? 0) + (b?.output_tokens ?? 0)
  }
}
