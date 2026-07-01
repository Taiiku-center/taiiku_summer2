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

type ContactType = '欠席' | '遅刻'
type Item = { date: string; time: string }

function formatDate(ds: string) {
  return new Date(ds + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

export default function AbsencePage() {
  const router = useRouter()
  const [student, setStudent]       = useState<Student | null>(null)
  const [date, setDate]             = useState('')
  const [time, setTime]             = useState('')
  const [items, setItems]           = useState<Item[]>([])
  const [type, setType]             = useState<ContactType>('欠席')
  const [makeUp, setMakeUp]         = useState<'希望する' | '希望しない' | '未定'>('未定')
  const [note, setNote]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [doneItems, setDoneItems]   = useState<Item[]>([])
  const [doneIds, setDoneIds]       = useState<string[]>([])
  const [cancelling, setCancelling] = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
    const today = toDateStr(new Date())
    setDate(today)
    const dow = new Date().getDay()
    const first = TIME_SLOTS.find(s => isSlotAvailable(dow, s))
    setTime(first || TIME_SLOTS[0])
  }, [router])

  function slotsForDate(ds: string) {
    if (!ds) return TIME_SLOTS
    const dow = new Date(ds + 'T00:00:00').getDay()
    return TIME_SLOTS.filter(s => isSlotAvailable(dow, s))
  }

  function handleDateChange(ds: string) {
    setDate(ds)
    const slots = slotsForDate(ds)
    if (!slots.includes(time)) setTime(slots[0] || '')
  }

  function addItem() {
    if (!date || !time) return
    if (date < PERIOD_START || date > PERIOD_END) { setError('講習期間外の日付です'); return }
    if (items.some(i => i.date === date && i.time === time)) { setError('同じ日時がすでに追加されています'); return }
    setError('')
    setItems(prev => [...prev, { date, time }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!student || !date) { setError('日付を選択してください'); return }
    const slots = slotsForDate(date)
    if (slots.length === 0) { setError('選択した日付は授業がありません'); return }
    const targets = items.length > 0 ? items : [{ date, time }]
    if (date < PERIOD_START || date > PERIOD_END) { setError('講習期間外の日付です'); return }
    setSubmitting(true)
    setError('')
    const supabase = createClient()
    const insertedIds: string[] = []
    for (const item of targets) {
      const { data: inserted, error: insertError } = await supabase.from('summer_absences').insert({
        student_id: student.id, full_name: student.full_name,
        date: item.date, time: item.time, type, make_up_request: makeUp, note,
      }).select('id').single()
      if (insertError) {
        setError('送信に失敗しました。再度お試しください。')
        setSubmitting(false)
        return
      }
      if (inserted) insertedIds.push(inserted.id)
      const notifType = type === '欠席' ? 'absence' : 'late'
      const notifTitle = type === '欠席' ? '欠席連絡がありました' : '遅刻連絡がありました'
      await supabase.from('summer_notifications').insert({
        type: notifType, title: notifTitle,
        message: `${student.full_name}（${item.date} ${item.time}〜）`, is_read: false,
      })
      if (makeUp === '希望する') {
        await supabase.from('summer_notifications').insert({
          type: 'makeup', title: '振替希望があります',
          message: `${student.full_name}（${item.date} ${item.time}〜）`, is_read: false,
        })
      }
      const makeupText = makeUp === '希望する' ? '\n振替：希望する' : ''
      sendEmail(
        `【${type}】${student.full_name} ${item.date} ${item.time}〜`,
        `${student.full_name} さんから${type}の連絡がありました。\n日付：${item.date}\n時間：${item.time}〜${makeupText}\n管理画面でご確認ください。`,
      )
    }
    setDoneItems(targets)
    setDoneIds(insertedIds)
    setDone(true)
    setSubmitting(false)
  }

  async function handleCancelSubmission() {
    if (doneIds.length === 0) return
    setCancelling(true)
    const supabase = createClient()
    await supabase.from('summer_absences').delete().in('id', doneIds)
    setCancelling(false)
    router.push('/parent')
  }

  if (!student) return null

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-gray-800">連絡が送信されました</h2>
          <div className="bg-orange-50 rounded-2xl p-4 text-left space-y-3">
            <div className="flex justify-between text-sm border-b border-orange-100 pb-2">
              <span className="text-gray-500">種別</span>
              <span className="font-bold text-orange-700">{type}</span>
            </div>
            {doneItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-500">{formatDate(item.date)}</span>
                <span className="font-semibold text-gray-700">{item.time}〜</span>
              </div>
            ))}
            <div className="flex justify-between text-sm border-t border-orange-100 pt-2">
              <span className="text-gray-500">振替</span>
              <span className="font-semibold text-gray-700">{makeUp}</span>
            </div>
          </div>
          <button onClick={() => router.push('/parent')}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl">
            ホームに戻る
          </button>
          <button onClick={handleCancelSubmission} disabled={cancelling}
            className="w-full border-2 border-red-200 text-red-500 font-bold py-3 rounded-2xl text-sm disabled:opacity-40 active:bg-red-50">
            {cancelling ? '取り消し中...' : '送信を取り消す'}
          </button>
        </div>
      </div>
    )
  }

  const slots = slotsForDate(date)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-xl transition-colors">‹</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-800">欠席・遅刻連絡</h1>
          <p className="text-xs text-gray-400">{student.full_name}</p>
        </div>
        <button onClick={() => router.push('/parent/absence/history')}
          className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg active:bg-gray-50 transition-colors">
          履歴
        </button>
      </header>
      <main className="px-4 py-5 max-w-2xl mx-auto space-y-4">

        {/* 種類 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">連絡の種類</h2>
          <div className="grid grid-cols-2 gap-2">
            {(['欠席', '遅刻'] as ContactType[]).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-3.5 rounded-2xl text-sm font-bold border-2 transition-all
                  ${type === t
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                    : 'border-gray-200 text-gray-500 hover:border-orange-300'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">以前に送った連絡を取り消したい場合は履歴からご操作ください</p>
            <button onClick={() => router.push('/parent/absence/history')}
              className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg active:bg-gray-50 transition-colors">
              履歴を見る →
            </button>
          </div>
        </div>

        {/* 日時追加カード */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-orange-100 bg-orange-50 first:rounded-t-2xl">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{formatDate(item.date)}</div>
                <div className="text-xs text-orange-600 font-medium">{item.time}〜</div>
              </div>
              <button onClick={() => removeItem(i)}
                className="flex-shrink-0 text-gray-400 active:text-red-500 text-xl w-8 h-8 flex items-center justify-center rounded-lg transition-colors">
                ×
              </button>
            </div>
          ))}

          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600">
                {items.length === 0 ? '対象の日時' : '続けて追加'}
              </h2>
              {items.length > 0 && (
                <button onClick={addItem} disabled={!date || slots.length === 0}
                  className="flex-shrink-0 bg-orange-500 text-white text-sm font-bold px-4 py-1.5 rounded-xl active:bg-orange-600 disabled:opacity-40 transition-colors">
                  ＋ 追加
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">日付</label>
                <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
                  min={PERIOD_START} max={PERIOD_END}
                  className="w-full min-w-0 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">時間</label>
                {slots.length > 0 ? (
                  <select value={time} onChange={e => setTime(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white transition-colors">
                    {slots.map(s => <option key={s} value={s}>{s}〜</option>)}
                  </select>
                ) : (
                  <div className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-400 bg-gray-50">
                    この曜日は授業がありません
                  </div>
                )}
              </div>
            </div>
            {items.length === 0 && (
              <button onClick={addItem} disabled={!date || slots.length === 0}
                className="w-full border border-dashed border-gray-300 text-gray-400 text-sm py-2 rounded-xl active:bg-gray-50 disabled:opacity-40 transition-colors">
                ＋ 複数の日時を追加する場合はここをタップ
              </button>
            )}
          </div>
        </div>

        {/* 振替 */}
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

        {/* 備考 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-600 mb-2">備考（任意）</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="連絡事項があればご記入ください" rows={3}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none transition-colors" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 text-center">{error}</div>}

        <button onClick={handleSubmit} disabled={submitting || !date || slots.length === 0}
          className="w-full bg-orange-500 text-white font-bold text-lg py-5 rounded-2xl disabled:opacity-40 active:scale-95 transition-all shadow-lg hover:bg-orange-600">
          {submitting ? '送信中...' : items.length > 0
            ? `${type}を連絡する（${items.length}件）`
            : `${type}を連絡する`}
        </button>
      </main>
    </div>
  )
}
