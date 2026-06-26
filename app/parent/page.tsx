'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, clearSession, PERIOD_START, PERIOD_END, type Student } from '../lib'

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

export default function ParentHomePage() {
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
  }, [router])

  function handleLogout() {
    clearSession()
    router.replace('/login')
  }

  if (!student) return null

  const menus = [
    {
      title: '授業を申し込む',
      desc: '希望の日時を選んで申込み',
      href: '/parent/schedule',
      bg: 'bg-blue-500',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <rect x="7" y="14" width="3" height="3" rx="0.5" fill="white" stroke="none"/>
          <rect x="10.5" y="14" width="3" height="3" rx="0.5" fill="white" stroke="none"/>
          <rect x="14" y="14" width="3" height="3" rx="0.5" fill="white" stroke="none"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-gray-800">📅 授業申込み</div>
          <div className="text-sm text-gray-400">{student.full_name} さん</div>
        </div>
        <button onClick={handleLogout}
          className="text-sm text-gray-500 border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 active:bg-gray-100 transition-colors">
          ログアウト
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* タイトル */}
        <div className="text-center space-y-1 py-4">
          <div className="text-4xl mb-3">📅</div>
          <h1 className="text-2xl font-bold text-gray-800">2026年 授業申込み</h1>
          <p className="text-sm text-gray-400">
            {formatDate(PERIOD_START)} 〜 {formatDate(PERIOD_END)}
          </p>
        </div>

        {/* メニュー */}
        <div className="grid grid-cols-1 gap-4">
          {menus.map(m => (
            <button key={m.href} onClick={() => router.push(m.href)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 text-left hover:shadow-md active:scale-[0.98] transition-all">
              <div className={`${m.bg} w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0`}>
                {m.icon}
              </div>
              <div>
                <div className="font-bold text-gray-800 text-base">{m.title}</div>
                <div className="text-sm text-gray-400 mt-0.5">{m.desc}</div>
              </div>
              <div className="ml-auto text-gray-300 text-xl">›</div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
