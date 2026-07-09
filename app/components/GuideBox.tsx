'use client'
import { useState } from 'react'

export default function GuideBox({ steps, note, bullets, defaultOpen = false, alwaysOpen = false, title }: {
  steps?: string[]
  note?: string
  bullets?: string[]
  defaultOpen?: boolean
  alwaysOpen?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = alwaysOpen || open
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl overflow-hidden">
      {alwaysOpen ? (
        <div className="px-4 pt-3 pb-1">
          <span className="text-sm font-bold text-blue-700">{title || '使い方'}</span>
        </div>
      ) : (
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left">
          <span className="text-sm font-bold text-blue-700 flex items-center gap-1.5">{title || '❓ 使い方を見る'}</span>
          <span className={`text-blue-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
      )}
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {bullets && (
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>{b}
                </li>
              ))}
            </ul>
          )}
          {steps && (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-blue-800">
                  <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          )}
          {note && <p className="text-xs text-blue-500 leading-relaxed pt-2 border-t border-blue-100">{note}</p>}
        </div>
      )}
    </div>
  )
}
