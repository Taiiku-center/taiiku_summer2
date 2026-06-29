'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, TIME_SLOTS, isSlotAvailable, toDateStr, PERIOD_START, PERIOD_END, type Student } from '../../lib'

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

export default function AbsencePage() {
  const router = useRouter()
  const [student, setStudent]       = useState<Student | null>(null)
  const [date, setDate]             = useState('')
  const [time, setTime]             = useState('')
  const [type, setType]             = useState<'欠席' | '遅刻'>('欠席')
  const [makeUp, setMakeUp]         = useState<'希望する' | '希望しない' | '未定'>('未定')
  const [note, setNote]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
    const today = toDateStr(new Date())
    setDate(today)
    const dow = new Date().getDay()
    const firstSlot = TIME_SLOTS.find(s => isSlotAvailable(dow, s))
    setTime(firstSlot || TIME_SLOTS[0])
  }, [router])

  async function handleSubmit() {
    if (!student || !date || !time) { setError('すべての項目を入力してください'); return }
    if (date < PERIOD_START || date > PERIOD_END) { setError('夏期講習の期間外の日付です'); return }
    setSubmitting(true)
    setError('')
    const supabase = createClient()
    await supabase.from('summer_absences').insert({
      student_id: student.id, full_name: student.full_name,
      date, time, type, make_up_request: makeUp, note,
    })
    const notifType = type === '欠席' ? 'absence' : 'late'
    const notifTitle = type === '欠席' ? '欠席連絡がありました' : '遅刻連絡がありました'
    await supabase.from('summer_notifications').insert({
      type: notifType, title: notifTitle,
      message: `${student.full_name}（${date} ${time}〜）`, is_read: false,
    })
    if (makeUp === '希望する') {
      await supabase.from('summer_notifications').insert({
        type: 'makeup', title: '振替希望があります',
        message: `${student.full_name}（${date} ${time}〜）`, is_read: false,
      })
    }
    const emailSubject = `【${type}】${student.full_name} ${date} ${time}〜`
    const makeupText = makeUp === '希望する' ? '\n振替：希望する' : ''
    sendEmail(emailSubject, `${student.full_name} さんから${type}の連絡がありました。\n日付：${date}\n時間：${time}〜${makeupText}\n管理画面でご確認ください。`)
    setDone(true); setSubmitting(false); setNote('')
  }

  if (!student) return null

  if (done) {
    const d = new Date(date + 'T00:00:00')
    const dateLabel = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-gray-800">連絡が送信されました</h2>
          <div className="bg-orange-50 rounded-2xl p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">種別</span>
              <span className="font-bold text-orange-700">{type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">日付</span>
              <span className="font-semibold text-gray-700">{dateLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">時間</span>
              <span className="font-semibold text-gray-700">{time}〜</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">振替</span>
              <span className="font-semibold text-gray-700">{makeUp}</span>
            </div>
          </div>
          <button onClick={() => router.push('/parent')}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl">
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
          <h1 className="text-base font-bold text-gray-800">欠席・遅刻連絡</h1>
          <p className="text-xs text-gray-400">{student.full_name}</p>
        </div>
      </header>
      <main className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">連絡の種類</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['欠席', '遅刻'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-4 rounded-2xl text-base font-bold border-2 transition-all
                  ${type === t ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'border-gray-200 text-gray-500 hover:border-orange-300'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">対象の日付</label>
              <input type="date" value={date} onChange={e => {
                  setDate(e.target.value)
                  const dow = new Date(e.target.value + 'T00:00:00').getDay()
                  const firstSlot = TIME_SLOTS.find(s => isSlotAvailable(dow, s))
                  setTime(firstSlot || '')
                }}
                min={PERIOD_START} max={PERIOD_END}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-400 transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">対象の時間</label>
              <select value={time} onChange={e => setTime(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-400 bg-white transition-colors">
                {TIME_SLOTS.filter(s => isSlotAvailable(new Date(date + 'T00:00:00').getDay(), s)).map(s => <option key={s} value={s}>{s}〜</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">振替について</h2>
          <div className="space-y-2">
            {(['希望する', '希望しない', '未定'] as const).map(opt => (
              <button key={opt} onClick={() => setMakeUp(opt)}
                className={`w-full py-3.5 rounded-xl text-sm font-medium border-2 transition-all text-left px-4
                  ${makeUp === opt ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                {opt === '希望する' ? '🔄 振替を希望する' : opt === '希望しない' ? '✕ 振替は希望しない' : '❓ まだ未定'}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-600 mb-2">備考（任意）</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="連絡事項があればご記入ください" rows={3}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none transition-colors" />
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 text-center">{error}</div>}
        <button onClick={handleSubmit} disabled={submitting || !date}
          className="w-full bg-orange-500 text-white font-bold text-lg py-5 rounded-2xl disabled:opacity-40 active:scale-95 hover:bg-orange-600 transition-all shadow-lg">
          {submitting ? '送信中...' : `${type}を連絡する`}
        </button>
      </main>
    </div>
  )
}
