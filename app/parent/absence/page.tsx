'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, toDateStr, PERIOD_START, PERIOD_END, type Student, type Lesson } from '../../lib'

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
type Item = { date: string; time: string; end_time: string }

function formatDate(ds: string) {
  return new Date(ds + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

export default function AbsencePage() {
  const router = useRouter()
  const [student, setStudent]             = useState<Student | null>(null)
  const [lessons, setLessons]             = useState<Lesson[]>([])
  const [date, setDate]                   = useState('')
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set())
  const [items, setItems]                 = useState<Item[]>([])
  const [type, setType]                   = useState<ContactType>('欠席')
  const [makeUp, setMakeUp]               = useState<'希望する' | '希望しない' | '未定'>('未定')
  const [note, setNote]                   = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [done, setDone]                   = useState(false)
  const [doneItems, setDoneItems]         = useState<Item[]>([])
  const [doneIds, setDoneIds]             = useState<string[]>([])
  const [cancelling, setCancelling]       = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
    setDate(toDateStr(new Date()))
    fetchLessons(s)
  }, [router])

  async function fetchLessons(s: Student) {
    const supabase = createClient()
    const { data } = await supabase.from('summer_lessons2')
      .select('*').eq('student_id', s.id).neq('status', 'cancelled')
      .gte('date', PERIOD_START).lte('date', PERIOD_END)
      .order('date').order('start_time')
    setLessons(data || [])
  }

  const lessonsOnDate = lessons.filter(l => l.date === date)

  function toggleTime(startTime: string) {
    setSelectedTimes(prev => {
      const n = new Set(prev)
      n.has(startTime) ? n.delete(startTime) : n.add(startTime)
      return n
    })
  }

  function handleDateChange(ds: string) {
    setDate(ds)
    setSelectedTimes(new Set())
  }

  function addItems() {
    if (!date || selectedTimes.size === 0) return
    if (date < PERIOD_START || date > PERIOD_END) { setError('講習期間外の日付です'); return }
    const newItems: Item[] = []
    for (const time of selectedTimes) {
      const lesson = lessonsOnDate.find(l => l.start_time === time)
      if (!lesson) continue
      if (items.some(i => i.date === date && i.time === time)) continue
      newItems.push({ date, time, end_time: lesson.end_time })
    }
    if (newItems.length === 0) { setError('選択した授業はすでに追加されています'); return }
    setError('')
    setItems(prev => [...prev, ...newItems])
    setSelectedTimes(new Set())
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!student) return
    const targets = items.length > 0 ? items
      : lessonsOnDate
          .filter(l => selectedTimes.has(l.start_time))
          .map(l => ({ date: l.date, time: l.start_time, end_time: l.end_time }))
    if (targets.length === 0) { setError('連絡する授業を選んでください'); return }
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
                <span className="font-semibold text-gray-700">{item.time}〜{item.end_time}</span>
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
                  ${type === t ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'border-gray-200 text-gray-500 hover:border-orange-300'}`}>
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

        {/* 追加済みアイテム */}
        {items.length > 0 && (
          <div className="bg-orange-50 rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-orange-100">
              <span className="text-xs font-semibold text-orange-700">連絡する授業（{items.length}件）</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-orange-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{formatDate(item.date)}</div>
                  <div className="text-xs text-orange-600 font-medium">{item.time}〜{item.end_time}</div>
                </div>
                <button onClick={() => removeItem(i)}
                  className="flex-shrink-0 text-gray-400 active:text-red-500 text-xl w-8 h-8 flex items-center justify-center rounded-lg">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 日付選択 + 授業カード */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">
              {items.length === 0 ? '連絡する日付を選択' : '他の日を追加'}
            </label>
            <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
              min={PERIOD_START} max={PERIOD_END}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
          </div>

          {date && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">
                {formatDate(date)}の授業
              </p>
              {lessonsOnDate.length === 0 ? (
                <div className="bg-gray-50 rounded-xl px-4 py-4 text-sm text-gray-400 text-center">
                  この日に選択した授業はありません
                </div>
              ) : (
                <div className="space-y-2">
                  {lessonsOnDate.map(lesson => {
                    const sel = selectedTimes.has(lesson.start_time)
                    const already = items.some(i => i.date === date && i.time === lesson.start_time)
                    return (
                      <button key={lesson.start_time} onClick={() => !already && toggleTime(lesson.start_time)}
                        disabled={already}
                        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all text-left
                          ${already ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
                            : sel ? 'bg-orange-50 border-orange-400 shadow-sm'
                            : 'border-gray-200 hover:border-orange-300'}`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                          ${already ? 'border-gray-300 bg-gray-200'
                            : sel ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                          {sel && !already && <span className="text-white text-xs font-bold">✓</span>}
                          {already && <span className="text-gray-400 text-xs">✓</span>}
                        </div>
                        <div className="flex-1">
                          <div className={`text-sm font-bold ${sel && !already ? 'text-orange-700' : 'text-gray-700'}`}>
                            {lesson.start_time}〜{lesson.end_time}
                          </div>
                          {already && <div className="text-xs text-gray-400 mt-0.5">追加済み</div>}
                        </div>
                      </button>
                    )
                  })}
                  {lessonsOnDate.length > 1 && selectedTimes.size < lessonsOnDate.filter(l => !items.some(i => i.date === date && i.time === l.start_time)).length && (
                    <button onClick={() => {
                      const available = lessonsOnDate.filter(l => !items.some(i => i.date === date && i.time === l.start_time))
                      setSelectedTimes(new Set(available.map(l => l.start_time)))
                    }} className="text-xs text-orange-500 px-2 py-1">すべて選択</button>
                  )}
                </div>
              )}

              {selectedTimes.size > 0 && items.length > 0 && (
                <button onClick={addItems}
                  className="mt-3 w-full border border-dashed border-orange-300 text-orange-500 text-sm font-medium py-2 rounded-xl active:bg-orange-50 transition-colors">
                  ＋ この日の選択を追加する
                </button>
              )}
            </div>
          )}
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

        <button onClick={handleSubmit}
          disabled={submitting || (items.length === 0 && selectedTimes.size === 0)}
          className="w-full bg-orange-500 text-white font-bold text-lg py-5 rounded-2xl disabled:opacity-40 active:scale-95 transition-all shadow-lg hover:bg-orange-600">
          {submitting ? '送信中...' : (() => {
            const total = items.length + selectedTimes.size
            return total > 0 ? `${type}を連絡する（${total}件）` : `${type}を連絡する`
          })()}
        </button>
      </main>
    </div>
  )
}
