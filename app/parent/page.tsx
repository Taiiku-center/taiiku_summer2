'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, clearSession, type Student } from '../lib'

export default function ParentHomePage() {
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
  }, [router])

  if (!student) return <div className="min-h-screen flex items-center justify-center text-black">読み込み中...</div>

  const menus = [
    { label: '授業を申し込む',       sub: '希望の日時を選んで申込み',   emoji: '📅', href: '/parent/schedule',   bg: 'bg-blue-500',   shadow: 'shadow-blue-100' },
    { label: '欠席・遅刻を連絡する', sub: '欠席・遅刻・振替希望の連絡', emoji: '📢', href: '/parent/absence',         bg: 'bg-orange-500', shadow: 'shadow-orange-100' },
    { label: '欠席・遅刻の履歴',     sub: '連絡履歴の確認・キャンセル', emoji: '📝', href: '/parent/absence/history', bg: 'bg-amber-400',  shadow: 'shadow-amber-100' },
    { label: '授業予定を確認する',   sub: '申込み済みの授業カレンダー', emoji: '📋', href: '/parent/calendar',        bg: 'bg-green-500',  shadow: 'shadow-green-100' },
    { label: '不具合を報告する',     sub: 'アプリの不具合・お困りの際', emoji: '🔧', href: '/parent/bug-report',      bg: 'bg-gray-500',   shadow: 'shadow-gray-100' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-black">☀️ 夏期講習</h1>
          <p className="text-xs text-black mt-0.5">{student.full_name} さん</p>
        </div>
        <button onClick={() => { clearSession(); router.replace('/login') }}
          className="text-sm text-black border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors">
          ログアウト
        </button>
      </header>

      <main className="px-4 py-8 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">☀️</div>
          <h2 className="text-xl font-bold text-black">2026年 夏期講習</h2>
          <p className="text-sm text-black mt-1">7月20日（月）〜 8月29日（土）</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {menus.map(m => (
            <button key={m.href} onClick={() => router.push(m.href)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-6 flex items-center gap-4 hover:shadow-md active:scale-[0.98] transition-all text-left">
              <div className={`w-14 h-14 ${m.bg} rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm ${m.shadow}`}>
                {m.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-black">{m.label}</div>
                <div className="text-sm text-black mt-0.5">{m.sub}</div>
              </div>
              <span className="text-black text-xl flex-shrink-0">›</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
