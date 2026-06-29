'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, type Student } from '../../lib'

const NOTIFY_EMAIL = 'kusunoki.infinite@gmail.com'
async function sendEmail(subject: string, body: string) {
  try {
    await fetch(`https://formsubmit.co/ajax/${NOTIFY_EMAIL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ _subject: subject, message: body, _captcha: 'false' }),
    })
  } catch {}
}

const SCREENS = ['ログイン画面', 'ホーム画面', '授業申込み画面', '欠席・遅刻連絡画面', '授業確認カレンダー', 'その他']

export default function BugReportPage() {
  const router = useRouter()
  const [student, setStudent]         = useState<Student | null>(null)
  const [screenName, setScreenName]   = useState(SCREENS[0])
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
  }, [router])

  async function handleSubmit() {
    if (!student || !description.trim()) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('summer_bug_reports').insert({
      student_id: student.id, full_name: student.full_name,
      screen_name: screenName, description: description.trim(), status: 'unread',
    })
    await supabase.from('summer_notifications').insert({
      type: 'bug', title: '不具合報告が届きました',
      message: `${student.full_name}（${screenName}）`, is_read: false,
    })
    sendEmail('【夏期講習】不具合報告', `${student.full_name} さんから不具合報告がありました。\n画面：${screenName}\n内容：${description.trim()}\n管理画面でご確認ください。`)
    setDone(true); setSubmitting(false)
  }

  if (!student) return null

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">🔧</div>
          <h2 className="text-xl font-bold text-gray-800">報告が送信されました</h2>
          <p className="text-sm text-gray-500">ご不便をおかけしました。確認後に対応いたします。</p>
          <button onClick={() => router.push('/parent')} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl">
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-xl transition-colors">‹</button>
        <div>
          <h1 className="text-base font-bold text-gray-800">不具合を報告する</h1>
          <p className="text-xs text-gray-400">{student.full_name}</p>
        </div>
      </header>
      <main className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-500">
          アプリで困ったことや不具合があればお知らせください。後ほど対応いたします。
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">不具合が起きた画面</label>
            <div className="space-y-2">
              {SCREENS.map(s => (
                <button key={s} onClick={() => setScreenName(s)}
                  className={`w-full py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all text-left
                    ${screenName === s ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">不具合の内容</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="どのような問題が起きたか、できるだけ詳しく教えてください"
              rows={5}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none transition-colors" />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={submitting || !description.trim()}
          className="w-full bg-gray-700 text-white font-bold text-lg py-5 rounded-2xl disabled:opacity-40 active:scale-95 hover:bg-gray-800 transition-all">
          {submitting ? '送信中...' : '不具合を報告する'}
        </button>
      </main>
    </div>
  )
}
