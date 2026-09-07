import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  dangerous?: boolean // red color for delete/danger actions
}

interface ContextMenuProps {
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ visible, x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!visible || !menuRef.current) { setPos(null); return }
    const rect = menuRef.current.getBoundingClientRect()
    setPos({
      top:  y + rect.height > window.innerHeight ? y - rect.height : y,
      left: x + rect.width  > window.innerWidth  ? x - rect.width  : x,
    })
  }, [visible, x, y, items.length])

  useEffect(() => {
    if (!visible) return

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-editor-elevated-highlight border border-editor-border rounded shadow-lg overflow-hidden"
      style={{
        left: `${pos?.left ?? x}px`,
        top:  `${pos?.top  ?? y}px`,
        minWidth: '140px',
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className={cn(
            'w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors border-b border-editor-border last:border-b-0',
            item.dangerous
              ? 'text-red-400 hover:bg-red-500 hover:bg-opacity-10'
              : 'text-[#e5e5e5] hover:bg-editor-accent-dim'
          )}
        >
          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
