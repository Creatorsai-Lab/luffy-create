import { useState, useMemo } from 'react'
import { Shapes, Search } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { ICON_MAP, ICON_CATEGORIES, ALL_CATEGORY } from '../../engine/iconData'
import { makeIcon } from '../../utils/defaults'
import { PanelHeader } from './TextPanel'

const CATEGORIES = [ALL_CATEGORY, ...Object.keys(ICON_CATEGORIES)]

export default function IconCollectionPanel() {
  const { addElement } = useEditorStore()
  const [query,    setQuery]    = useState('')
  const [category, setCategory] = useState(ALL_CATEGORY)

  const filteredIcons = useMemo(() => {
    const pool = category === ALL_CATEGORY
      ? Object.keys(ICON_MAP)
      : (ICON_CATEGORIES[category] ?? [])
    const q = query.toLowerCase().replace(/\s/g, '')
    return q ? pool.filter(n => n.toLowerCase().includes(q)) : pool
  }, [category, query])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Shapes size={12} />} title="Icons" />

      {/* Search */}
      <div className="px-3 py-2 border-b border-editor-border">
        <div className="flex items-center gap-2 bg-editor-elevated-highlight border border-editor-border rounded px-2 py-1">
          <Search size={11} className="text-[#f2f2f2] flex-none" />
          <input
            type="text"
            placeholder="Search icons…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-editor-text outline-none placeholder-[#f2f2f2] nodrag"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto no-scrollbar border-b border-editor-border flex-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-none text-[10px] px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
              category === cat
                ? 'bg-editor-accent text-white'
                : 'bg-editor-elevated-highlight text-[#f2f2f2] hover:text-editor-text'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Icon grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-5 gap-1.5">
          {filteredIcons.map(name => {
            const Comp = ICON_MAP[name]
            if (!Comp) return null
            return (
              <button
                key={name}
                title={name}
                onClick={() => addElement(makeIcon(name, 80, 80))}
                className="aspect-square flex items-center justify-center rounded transition-all group bg-editor-elevated-highlight hover:bg-editor-hover"
              >
                <Comp
                  size={20}
                  strokeWidth={1.75}
                  className="text-[#f2f2f2] group-hover:text-editor-accent transition-colors"
                />
              </button>
            )
          })}
          {filteredIcons.length === 0 && (
            <p className="col-span-5 text-xs text-[#f2f2f2] text-center py-4">No icons found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
