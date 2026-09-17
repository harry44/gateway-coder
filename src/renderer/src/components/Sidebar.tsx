import type { ConversationMeta } from '../../../shared/types'

interface Props {
  conversations: ConversationMeta[]
  activeId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export default function Sidebar({ conversations, activeId, onNew, onSelect, onDelete }: Props): JSX.Element {
  return (
    <aside className="sidebar">
      <button className="new-chat" onClick={onNew} type="button">
        + New chat
      </button>
      <div className="convo-list">
        {conversations.length === 0 && <div className="empty-hint">No conversations yet.</div>}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`convo-item ${c.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="convo-title">{c.title}</div>
            <button
              className="convo-del"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(c.id)
              }}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
