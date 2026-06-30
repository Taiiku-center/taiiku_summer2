'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, toDateStr, PERIOD_START, PERIOD_END, type Student, type Lesson } from '../../lib'

type CalView = 'month' | 'week' | 'day'

type Absence = {
  id: string
  student_id: string
  full_name: string
  date: string
  time: string
  type: '欠席' | '遅刻'
  make_up_request: '希望する' | '希望しない' | '未定'
  note: string
  created_at: string
}

const DOW6 = ['月', '火', '水', '木', '金', '土']

function clamp(ds: string): string {
  if (ds < PERIOD_START) return PERIOD_START
  if (ds > PERIOD_END)   return PERIOD_END
  return ds
}

export default function CalendarPage() {
  const router = useRouter()
  const [student,  setStudent]  = useState<Student | null>(null)
  const [lessons,  setLessons]  = useState<Lesson[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading,  setLoading]  = useState(true)
  const [calView,  setCalView]  = useState<CalView>('month')

  const [viewMonth, setViewMonth] = useState(() => new Date(PERIOD_START + 'T00:00:00'))

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const t = toDateStr(new Date())
    const base = t >= PERIOD_START && t <= PERIOD_END ? new Date() : new Date(PERIOD_START + 'T00:00:00')
    const d = new Date(base)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d
  })

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = toDateStr(new Date())
    return t >= PERIOD_START && t <= PERIOD_END ? t : PERIOD_START
  })

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
    fetchData(s.id)
  }, [router])

  async function fetchData(studentId: string) {
    const supabase = createClient()
    const [l, a] = await Promise.all([
      supabase.from('summer_lessons2').select('*').eq('student_id', studentId).neq('status', 'cancelled').order('date').order('start_time'),
      supabase.from('summer_absences').select('*').eq('student_id', studentId).order('date'),
    ])
    setLessons(l.data || [])
    setAbsences(a.data || [])
    setLoading(false)
  }

  const lessonsOn  = (ds: string) => lessons.filter(l => l.date === ds)
  const absencesOn = (ds: string) => absences.filter(a => a.date === ds)
  const inPeriod   = (ds: string) => ds >= PERIOD_START && ds <= PERIOD_END

  // ── Month ──
  const canPrevMonth = !(viewMonth.getFullYear() === 2026 && viewMonth.getMonth() === 6)
  const canNextMonth = !(viewMonth.getFullYear() === 2026 && viewMonth.getMonth() === 7)
  function monthDays(): (Date | null)[] {
    const year = viewMonth.getFullYear(), month = viewMonth.getMonth()
    const first = new Date(year, month, 1), last = new Date(year, month + 1, 0)
    const firstDow = first.getDay() === 0 ? 0 : first.getDay() - 1
    const allDays: (Date | null)[] = []
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, month, d)
      if (date.getDay() === 0) continue
      const ds = toDateStr(date)
      allDays.push(inPeriod(ds) ? date : null)
    }
    const days: (Date | null)[] = [...Array(firstDow).fill(null), ...allDays]
    while (days.length % 6 !== 0) days.push(null)
    return days
  }

  // ── Week ──
  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  })
  const canPrevWeek = toDateStr(weekStart) > PERIOD_START
  const canNextWeek = (() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return toDateStr(d) <= PERIOD_END })()
  function prevWeek() { if (!canPrevWeek) return; const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  function nextWeek() { if (!canNextWeek) return; const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }

  // ── Day ──
  const canPrevDay = selectedDate > PERIOD_START
  const canNextDay = selectedDate < PERIOD_END
  function prevDay() {
    if (!canPrevDay) return
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() - 1)
    setSelectedDate(clamp(toDateStr(d)))
  }
  function nextDay() {
    if (!canNextDay) return
    const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + 1)
    setSelectedDate(clamp(toDateStr(d)))
  }

  const today = toDateStr(new Date())

  function DotRow({ ds }: { ds: string }) {
    const lc = lessonsOn(ds).length, ac = absencesOn(ds).length
    if (lc === 0 && ac === 0) return null
    return (
      <div className="flex gap-0.5 mt-0.5 justify-center">
        {lc > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        {ac > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
      </div>
    )
  }

  function DayDetail({ ds }: { ds: string }) {
    const sL = lessonsOn(ds), sA = absencesOn(ds)
    if (sL.length === 0 && sA.length === 0) return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
        この日は予定がありません
      </div>
    )
    return (
      <div className="space-y-3">
        {sL.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-blue-600 mb-2">📅 授業申込み</div>
            <div className="space-y-2">
              {sL.map(l => (
                <div key={l.id} className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
                  <span className="text-sm font-medium text-blue-700">{l.start_time}〜{l.end_time}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                    ${l.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'}`}>
                    {l.status === 'confirmed' ? '確定' : '申込済'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {sA.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-orange-600 mb-2">📢 欠席・遅刻連絡</div>
            <div className="space-y-2">
              {sA.map(a => (
                <div key={a.id} className="bg-orange-50 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-orange-700">{a.type}（{a.time}〜）</span>
                    <span className="text-xs text-orange-500">振替：{a.make_up_request}</span>
                  </div>
                  {a.note && <p className="text-xs text-orange-600">{a.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (!student) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-xl transition-colors">‹</button>
        <div>
          <h1 className="text-base font-bold text-gray-800">授業予定を確認する</h1>
          <p className="text-xs text-gray-400">{student.full_name}</p>
        </div>
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {loading ? (
          <div className="text-center text-gray-400 py-16">読み込み中...</div>
        ) : (<>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{lessons.length}</div>
              <div className="text-sm text-blue-500 mt-1">申込みコマ数</div>
            </div>
            <div className="bg-orange-50 rounded-2xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-500">{absences.length}</div>
              <div className="text-sm text-orange-400 mt-1">欠席・遅刻連絡</div>
            </div>
          </div>

          {/* 月・週・日 切替 */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['month', 'week', 'day'] as CalView[]).map((v, i) => (
              <button key={v} onClick={() => setCalView(v)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-colors
                  ${calView === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                {['月', '週', '日'][i]}
              </button>
            ))}
          </div>

          {/* ══ 月ビュー ══ */}
          {calView === 'month' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  disabled={!canPrevMonth}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-20">‹</button>
                <span className="text-base font-bold text-gray-800">{viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月</span>
                <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  disabled={!canNextMonth}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-20">›</button>
              </div>
              <div className="grid grid-cols-6 mb-2">
                {DOW6.map((d, i) => (
                  <div key={d} className={`text-center text-sm font-bold py-2 ${i === 5 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {monthDays().map((d, i) => {
                  if (!d) return <div key={i} />
                  const ds = toDateStr(d)
                  const isToday = ds === today
                  const isSel = selectedDate === ds
                  const dow = d.getDay()
                  return (
                    <button key={ds}
                      onClick={() => { setSelectedDate(ds); setCalView('day') }}
                      className={`relative flex flex-col items-center justify-center py-3 rounded-xl text-sm font-medium transition-all active:scale-95
                        ${!isSel && !isToday ? (dow === 6 ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-700 hover:bg-gray-100') : ''}
                        ${isToday && !isSel ? 'bg-blue-50 text-blue-600' : ''}
                        ${isSel ? 'bg-blue-600 text-white shadow-md' : ''}`}>
                      <span className="text-base font-bold">{d.getDate()}</span>
                      <DotRow ds={ds} />
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-5 mt-4 pt-4 border-t border-gray-100 justify-center">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> 申込あり
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> 欠席・遅刻連絡
                </div>
              </div>
            </div>
          )}

          {/* ══ 週ビュー ══ */}
          {calView === 'week' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={prevWeek} disabled={!canPrevWeek}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-20">‹</button>
                <span className="text-base font-bold text-gray-800">
                  {weekDays[0].getMonth()+1}/{weekDays[0].getDate()} 〜 {weekDays[5].getMonth()+1}/{weekDays[5].getDate()}
                </span>
                <button onClick={nextWeek} disabled={!canNextWeek}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-20">›</button>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {DOW6.map((d, i) => (
                  <div key={d} className={`text-center text-sm font-bold py-1 ${i === 5 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>
                ))}
                {weekDays.map(d => {
                  const ds = toDateStr(d)
                  const inP = inPeriod(ds)
                  const isToday = ds === today
                  const isSel = selectedDate === ds
                  const dow = d.getDay()
                  return (
                    <button key={ds} disabled={!inP}
                      onClick={() => { setSelectedDate(ds); setCalView('day') }}
                      className={`relative flex flex-col items-center justify-center py-3 rounded-xl text-sm font-medium transition-all active:scale-95
                        ${!inP ? 'invisible' : ''}
                        ${!isSel && !isToday && inP ? (dow === 6 ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-700 hover:bg-gray-100') : ''}
                        ${isToday && !isSel ? 'bg-blue-50 text-blue-600' : ''}
                        ${isSel ? 'bg-blue-600 text-white shadow-md' : ''}`}>
                      <span className="text-base font-bold">{d.getDate()}</span>
                      {inP && <DotRow ds={ds} />}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-5 pt-4 border-t border-gray-100 justify-center">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> 申込あり
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> 欠席・遅刻連絡
                </div>
              </div>
            </div>
          )}

          {/* ══ 日ビュー ══ */}
          {calView === 'day' && (
            <>
              <div className="flex items-center justify-between">
                <button onClick={prevDay} disabled={!canPrevDay}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-20">‹</button>
                <span className="text-base font-bold text-gray-800">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                </span>
                <button onClick={nextDay} disabled={!canNextDay}
                  className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-20">›</button>
              </div>
              <DayDetail ds={selectedDate} />
            </>
          )}
        </>)}
      </main>
    </div>
  )
}
