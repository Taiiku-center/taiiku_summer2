'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, toDateStr, PERIOD_START, PERIOD_END, type Student, type Lesson } from '../../lib'
import GuideBox from '../../components/GuideBox'

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

function formatDate(ds: string) {
  return new Date(ds + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

export default function AbsencePage() {
  const router = useRouter()
  const [student, setStudent]             = useState<Student | null>(null)
  const [lessons, setLessons]             = useState<Lesson[]>([])
  const [loading, setLoading]             = useState(true)
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [openDates, setOpenDates]         = useState<Set<string>>(new Set())
  const [type, setType]                   = useState<ContactType>('欠席')
  const [makeUp, setMakeUp]               = useState<'希望する' | '希望しない' | '未定'>('未定')
  const [note, setNote]                   = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [done, setDone]                   = useState(false)
  const [doneItems, setDoneItems]         = useState<Lesson[]>([])
  const [doneIds, setDoneIds]             = useState<string[]>([])
  const [cancelling, setCancelling]       = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
    fetchLessons(s)
  }, [router])

  async function fetchLessons(s: Student) {
    const supabase = createClient()
    const today = toDateStr(new Date())
    const { data } = await supabase.from('summer_lessons2')
      .select('*').eq('student_id', s.id).neq('status', 'cancelled')
      .gte('date', today <= PERIOD_START ? PERIOD_START : today)
      .lte('date', PERIOD_END)
      .order('date').order('start_time')
    setLessons(data || [])
    setLoading(false)
  }

  function toggleLesson(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleDate(date: string) {
    setOpenDates(prev => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n })
  }

  async function handleSubmit() {
    if (!student || selected.size === 0) { setError('連絡する授業を選んでください'); return }
    const targets = lessons.filter(l => selected.has(l.id))
    setSubmitting(true)
    setError('')
    const supabase = createClient()
    const insertedIds: string[] = []
    for (const lesson of targets) {
      const { data: inserted, error: insertError } = await supabase.from('summer_absences').insert({
        student_id: student.id, full_name: student.full_name,
        date: lesson.date, time: lesson.start_time, type, make_up_request: makeUp, note,
      }).select('id').single()
      if (insertError) {
        if (insertedIds.length > 0) {
          await supabase.from('summer_absences').delete().in('id', insertedIds)
        }
        setError('送信に失敗しました。再度お試しください。')
        setSubmitting(false)
        return
      }
      if (inserted) insertedIds.push(inserted.id)
      await supabase.from('summer_notifications').insert({
        type: type === '欠席' ? 'absence' : 'late',
        title: type === '欠席' ? '欠席連絡がありました' : '遅刻連絡がありました',
        message: `${student.full_name}（${lesson.date} ${lesson.start_time}〜）`, is_read: false,
      })
      if (makeUp === '希望する') {
        await supabase.from('summer_notifications').insert({
          type: 'makeup', title: '振替希望があります',
          message: `${student.full_name}（${lesson.date} ${lesson.start_time}〜）`, is_read: false,
        })
      }
      sendEmail(
        `【${type}】${student.full_name} ${lesson.date} ${lesson.start_time}〜`,
        `${student.full_name} さんから${type}の連絡がありました。\n日付：${lesson.date}\n時間：${lesson.start_time}〜${lesson.end_time}${makeUp === '希望する' ? '\n振替：希望する' : ''}\n管理画面でご確認ください。`,
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
            {doneItems.map((l, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-500">{formatDate(l.date)}</span>
                <span className="font-semibold text-gray-700">{l.start_time}〜{l.end_time}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm border-t border-orange-100 pt-2">
              <span className="text-gray-500">振替</span>
              <span className="font-semibold text-gray-700">{makeUp}</span>
            </div>
          </div>
          <button onClick={() => router.push('/parent')} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl">ホームに戻る</button>
          <button onClick={handleCancelSubmission} disabled={cancelling}
            className="w-full border-2 border-red-200 text-red-500 font-bold py-3 rounded-2xl text-sm disabled:opacity-40 active:bg-red-50">
            {cancelling ? '取り消し中...' : '送信を取り消す'}
          </button>
        </div>
      </div>
    )
  }

  const grouped = lessons.reduce<Record<string, Lesson[]>>((acc, l) => {
    ;(acc[l.date] = acc[l.date] || []).push(l)
    return acc
  }, {})

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

        <GuideBox
          steps={[
            '「欠席」または「遅刻」を選びます。',
            '対象の日付と時間を選びます。',
            '振替希望の有無を選びます。',
            '必要に応じて連絡事項を入力します。',
            '「送信」を押します。',
          ]}
          note="送信後、教室側に連絡内容が届きます。"
        />

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

        {/* 授業一覧 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600">連絡する授業を選択</h2>
            {selected.size > 0 && (
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">{selected.size}件選択中</span>
            )}
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-400 text-sm">読み込み中...</div>
          ) : lessons.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              申し込み済みの授業がありません
            </div>
          ) : (
            Object.entries(grouped).map(([date, dayLessons]) => {
              const open = openDates.has(date)
              const selCount = dayLessons.filter(l => selected.has(l.id)).length
              return (
                <div key={date} className="border-b border-gray-100 last:border-0">
                  <button onClick={() => toggleDate(date)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                    <span className={`text-gray-400 text-sm transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                    <span className="flex-1 text-sm font-semibold text-gray-700">{formatDate(date)}</span>
                    {selCount > 0 && (
                      <span className="text-xs font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full">{selCount}件選択</span>
                    )}
                    <span className="text-xs text-gray-400">{dayLessons.length}コマ</span>
                  </button>
                  {open && dayLessons.map(lesson => {
                    const sel = selected.has(lesson.id)
                    return (
                      <button key={lesson.id} onClick={() => toggleLesson(lesson.id)}
                        className={`w-full flex items-center gap-4 px-5 py-4 border-t border-gray-100 transition-colors text-left
                          ${sel ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                        <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors
                          ${sel ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                          {sel && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                        <div className="flex-1">
                          <div className={`text-sm font-bold ${sel ? 'text-orange-700' : 'text-gray-800'}`}>
                            {lesson.start_time}〜{lesson.end_time}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })
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
            placeholder={type === '遅刻' ? '到着予定時刻をご記入ください（例：19:30頃到着予定）' : '連絡事項があればご記入ください'} rows={3}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none transition-colors" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 text-center">{error}</div>}

        <button onClick={handleSubmit} disabled={submitting || selected.size === 0}
          className="w-full bg-orange-500 text-white font-bold text-lg py-5 rounded-2xl disabled:opacity-40 active:scale-95 transition-all shadow-lg hover:bg-orange-600">
          {submitting ? '送信中...' : selected.size > 0 ? `${type}を連絡する（${selected.size}件）` : `${type}を連絡する`}
        </button>
      </main>
    </div>
  )
}
