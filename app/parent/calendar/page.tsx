'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, toDateStr, PERIOD_START, PERIOD_END, type Student, type Lesson } from '../../lib'

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

export default function CalendarPage() {
  const router = useRouter()
  const [student, setStudent]     = useState<Student | null>(null)
  const [lessons, setLessons]     = useState<Lesson[]>([])
  const [absences, setAbsences]   = useState<Absence[]>([])
  const [viewMonth, setViewMonth] = useState(() => new Date(PERIOD_START + 'T00:00:00'))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

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

  function calendarDays(): (Date | null)[] {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const first = new Date(year, month, 1)
    const last  = new Date(year, month + 1, 0)
    const startDow = (first.getDay() + 6) % 7
    const days: (Date | null)[] = Array(startDow).fill(null)
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
    while (days.length % 7 !== 0) days.push(null)
    return days
  }

  function lessonsOn(ds: string) { return lessons.filter(l => l.date === ds) }
  function absencesOn(ds: string) { return absences.filter(a => a.date === ds) }
  function inPeriod(ds: string) { return ds >= PERIOD_START && ds <= PERIOD_END }

  const days = calendarDays()
  const today = toDateStr(new Date())
  const selectedLessons  = selectedDate ? lessonsOn(selectedDate) : []
  const selectedAbsences = selectedDate ? absencesOn(selectedDate) : []

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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all">‹</button>
              <span className="text-base font-bold text-gray-800">
                {viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月
              </span>
              <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xl hover:bg-gray-200 active:scale-95 transition-all">›</button>
            </div>
            <div className="grid grid-cols-7 mb-2">
              {['月','火','水','木','金','土','日'].map((d, i) => (
                <div key={d} className={`text-center text-sm font-bold py-2 ${i===6?'text-red-500':i===5?'text-blue-500':'text-gray-400'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                if (!d) return <div key={i} />
                const ds = toDateStr(d)
                const inP = inPeriod(ds)
                const lCount = lessonsOn(ds).length
                const aCount = absencesOn(ds).length
                const isToday = ds === today
                const isSel = selectedDate === ds
                const dow = d.getDay()
                return (
                  <button key={ds} disabled={!inP}
                    onClick={() => setSelectedDate(isSel ? null : ds)}
                    className={`relative flex flex-col items-center justify-center py-3 rounded-xl text-sm font-medium transition-all active:scale-95
                      ${!inP ? 'text-gray-200' : ''}
                      ${inP && !isSel && !isToday ? (dow===0?'text-red-500 hover:bg-red-50':dow===6?'text-blue-500 hover:bg-blue-50':'text-gray-700 hover:bg-gray-100') : ''}
                      ${isToday && !isSel ? 'bg-blue-50 text-blue-600' : ''}
                      ${isSel ? 'bg-blue-600 text-white shadow-md' : ''}`}>
                    <span className="text-base font-bold">{d.getDate()}</span>
                    {(lCount > 0 || aCount > 0) && inP && (
                      <div className="flex gap-0.5 mt-0.5">
                        {lCount > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-blue-500'}`} />}
                        {aCount > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-orange-400'}`} />}
                      </div>
                    )}
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

          {selectedDate && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h2 className="text-base font-bold text-gray-800">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              </h2>
              {selectedLessons.length === 0 && selectedAbsences.length === 0 && (
                <p className="text-sm text-gray-400">この日は予定がありません</p>
              )}
              {selectedLessons.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-blue-600 mb-2">📅 授業申込み</div>
                  <div className="space-y-2">
                    {selectedLessons.map(l => (
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
              {selectedAbsences.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-orange-600 mb-2">📢 欠席・遅刻連絡</div>
                  <div className="space-y-2">
                    {selectedAbsences.map(a => (
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
          )}
        </>)}
      </main>
    </div>
  )
}
