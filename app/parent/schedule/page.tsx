'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, TIME_SLOTS, isSlotAvailable, endTime, toDateStr, PERIOD_START, PERIOD_END, type Lesson, type Student } from '../../lib'

const DAYS_JP = ['月', '火', '水', '木', '金', '土', '日']

function getMondayOf(d: Date) {
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m
}

type View = 'month' | 'week' | 'day'

export default function SchedulePage() {
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)
  const [existing, setExisting] = useState<Lesson[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>('week')
  const [current, setCurrent] = useState(new Date())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [cancelModal, setCancelModal] = useState<Lesson | null>(null)
  const [selectMode, setSelectMode] = useState(false)

  const dragActive        = useRef(false)
  const paintV            = useRef(true)
  const suppressNextClick = useRef(false)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
  }, [router])

  useEffect(() => { if (student) fetchExisting() }, [student, view, current])

  async function fetchExisting() {
    if (!student) return
    const supabase = createClient()
    let from: string, to: string
    if (view === 'month') {
      from = toDateStr(new Date(current.getFullYear(), current.getMonth(), 1))
      to   = toDateStr(new Date(current.getFullYear(), current.getMonth() + 1, 0))
    } else {
      const mon = getMondayOf(current)
      from = toDateStr(mon)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      to = toDateStr(sun)
    }
    const { data } = await supabase.from('summer_lessons2')
      .select('*').eq('student_id', student.id).neq('status', 'cancelled')
      .gte('date', from).lte('date', to)
    setExisting(data || [])
    setSelected(new Set())
  }

  function existingAt(dateObj: Date, slot: string) {
    const ds = toDateStr(dateObj)
    return existing.find(l => l.date === ds && l.start_time === slot)
  }

  async function cancelLesson(id: string) {
    const supabase = createClient()
    setExisting(prev => prev.filter(l => l.id !== id))
    setCancelModal(null)
    await supabase.from('summer_lessons2').delete().eq('id', id)
    setMsg('キャンセルしました。新しい日時を選んで申込めます')
    setTimeout(() => setMsg(''), 4000)
  }

  async function handleSubmit() {
    if (!student || selected.size === 0) return
    setSaving(true)
    const supabase = createClient()
    const rows = Array.from(selected).map(k => {
      const sep = k.indexOf('__')
      const ds = k.slice(0, sep), slot = k.slice(sep + 2)
      return { student_id: student.id, full_name: student.full_name, date: ds, start_time: slot, end_time: endTime(slot), status: 'pending' }
    })
    const { error } = await supabase.from('summer_lessons2').insert(rows)
    if (!error) {
      await supabase.from('summer_notifications').insert({
        type: 'lesson', title: '新しい授業申込みがありました',
        message: `${student.full_name}（${rows.length}コマ）`, is_read: false,
      })
    }
    setSaving(false)
    setMsg(error ? '申込みに失敗しました。再度お試しください。' : '申込みました')
    await fetchExisting()
    setTimeout(() => setMsg(''), 4000)
  }

  function key(dateObj: Date, slot: string) { return `${toDateStr(dateObj)}__${slot}` }

  function toggleCell(dateObj: Date, slot: string) {
    const lesson = existingAt(dateObj, slot)
    if (lesson) { setCancelModal(lesson); return }
    const k = key(dateObj, slot)
    setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  function paintCell(dateObj: Date, slot: string) {
    if (existingAt(dateObj, slot)) return
    const k = key(dateObj, slot)
    setSelected(prev => { const n = new Set(prev); paintV.current ? n.add(k) : n.delete(k); return n })
  }

  function navigatePrev() {
    setCurrent(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(n.getMonth() - 1)
      else if (view === 'week') n.setDate(n.getDate() - 7)
      else n.setDate(n.getDate() - 1)
      return n
    })
  }
  function navigateNext() {
    setCurrent(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(n.getMonth() + 1)
      else if (view === 'week') n.setDate(n.getDate() + 7)
      else n.setDate(n.getDate() + 1)
      return n
    })
  }

  function weekDates() {
    const mon = getMondayOf(current)
    return DAYS_JP.map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d })
  }

  function isInPeriod(d: Date) { const s = toDateStr(d); return s >= PERIOD_START && s <= PERIOD_END }

  // 曜日ごとの受講可能時間外セルはブロック
  function isBlocked(d: Date, slot: string) {
    return !isSlotAvailable(d.getDay(), slot)
  }

  function displayTitle() {
    const wd = weekDates()
    if (view === 'month') return `${current.getFullYear()}年${current.getMonth() + 1}月`
    if (view === 'week') return `${wd[0].getMonth()+1}/${wd[0].getDate()} 〜 ${wd[5].getMonth()+1}/${wd[5].getDate()}`
    const dow = ['日','月','火','水','木','金','土'][current.getDay()]
    return `${current.getMonth()+1}/${current.getDate()}（${dow}）`
  }

  if (!student) return null

  const WeekGrid = () => {
    const wd = weekDates()

    function onPointerDown(e: React.PointerEvent, d: Date, slot: string) {
      if (!isInPeriod(d) || isBlocked(d, slot)) return
      const isMouse = e.pointerType === 'mouse'

      if (isMouse) {
        suppressNextClick.current = true
        const lesson = existingAt(d, slot)
        if (lesson) { setCancelModal(lesson); return }
        paintV.current = !selected.has(key(d, slot))
        dragActive.current = true
        paintCell(d, slot)
      } else if (selectMode) {
        if (existingAt(d, slot)) return
        paintV.current = !selected.has(key(d, slot))
        dragActive.current = true
        paintCell(d, slot)
      }
    }

    function onPointerMove(e: React.PointerEvent) {
      if (!dragActive.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const ds2 = el?.dataset.ds, slot2 = el?.dataset.slot
      if (!ds2 || !slot2) return
      const [y, mo, d2] = ds2.split('-').map(Number)
      const dateObj = new Date(y, mo - 1, d2)
      if (!isBlocked(dateObj, slot2)) paintCell(dateObj, slot2)
    }

    function onPointerUp() { dragActive.current = false }

    function handleClick(d: Date, slot: string) {
      if (suppressNextClick.current) { suppressNextClick.current = false; return }
      if (!isInPeriod(d) || isBlocked(d, slot)) return
      toggleCell(d, slot)
    }

    return (
      <div
        onContextMenu={e => e.preventDefault()}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="bg-white rounded-2xl shadow-sm overflow-x-auto select-none"
        style={{
          touchAction: selectMode ? 'none' : 'pan-x pan-y',
          WebkitUserSelect: 'none', userSelect: 'none',
        }}>
        <div className="min-w-[360px]" style={{ display: 'grid', gridTemplateColumns: '52px repeat(6, 1fr)' }}>
          <div className="border-b border-r border-gray-200" />
          {wd.slice(0, 6).map((d, i) => {
            const inP = isInPeriod(d)
            return (
              <div key={i} className={`border-b border-r border-gray-200 py-2 text-center text-xs font-bold leading-tight
                ${i===5?'text-blue-500':'text-gray-600'}
                ${!inP ? 'opacity-30' : ''}`}>
                {DAYS_JP[i]}<br/><span className="font-normal text-gray-400">{d.getMonth()+1}/{d.getDate()}</span>
              </div>
            )
          })}
          {TIME_SLOTS.map(slot => (
            <div key={slot} className="contents">
              <div className="border-b border-r border-gray-200 flex items-center justify-end pr-1.5 text-xs text-gray-400 h-10 whitespace-nowrap">
                {slot}
              </div>
              {wd.slice(0, 6).map((d, di) => {
                const lesson = existingAt(d, slot)
                const sel = selected.has(key(d, slot))
                const inP = isInPeriod(d)
                const blocked = isBlocked(d, slot)
                return (
                  <div key={di}
                    data-ds={toDateStr(d)} data-slot={slot}
                    onPointerDown={e => onPointerDown(e, d, slot)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onClick={() => handleClick(d, slot)}
                    className={`border-b border-r border-gray-200 h-10 transition-colors
                      ${!inP || blocked ? 'bg-gray-50 cursor-not-allowed' :
                        lesson ? 'bg-teal-400 active:bg-teal-300 cursor-pointer' :
                        sel ? 'bg-blue-400 cursor-pointer' :
                        'hover:bg-blue-50 active:bg-blue-100 cursor-pointer'}`}
                    style={blocked ? { backgroundImage: 'repeating-linear-gradient(45deg, #d1d5db 0px, #d1d5db 1px, transparent 1px, transparent 6px)' } : undefined}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const MonthGrid = () => {
    const y = current.getFullYear(), m = current.getMonth()
    const first = new Date(y, m, 1), last = new Date(y, m+1, 0)
    const firstDow = first.getDay() === 0 ? 0 : first.getDay() - 1
    const submittedDates = new Set(existing.map(l => l.date))
    const allDays: Date[] = []
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(y, m, d)
      if (date.getDay() !== 0) allDays.push(date)
    }
    const cells: (Date|null)[] = [...Array(firstDow).fill(null), ...allDays]
    while (cells.length % 6 !== 0) cells.push(null)
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="grid grid-cols-6 mb-1">
          {['月','火','水','木','金','土'].map((d, i) => (
            <div key={d} className={`text-center text-xs font-bold py-2 ${i===5?'text-blue-500':'text-gray-500'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const ds = toDateStr(d), has = submittedDates.has(ds)
            const inP = isInPeriod(d)
            const isToday = ds === toDateStr(new Date()), dow = d.getDay()
            return (
              <button key={i} disabled={!inP} onClick={() => { if (inP) { setCurrent(d); setView('week') } }}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium transition-colors
                  ${!inP ? 'text-gray-200' : isToday ? 'bg-blue-600 text-white' :
                    dow===6 ? 'text-blue-500 hover:bg-blue-50' :
                    'text-gray-700 hover:bg-gray-100'}`}>
                {d.getDate()}
                {has && inP && <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-teal-500'}`} />}
              </button>
            )
          })}
        </div>
        {submittedDates.size > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-center">● = 申込み済みの日　タップで週ビューに移動</p>
        )}
      </div>
    )
  }

  const DayList = () => {
    const dow = current.getDay()
    const slots = TIME_SLOTS.filter(s => isSlotAvailable(dow, s))
    if (slots.length === 0) return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-400">この曜日は授業がありません</div>
    )
    return (
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {slots.map(slot => {
          const lesson = existingAt(current, slot)
          const sel = selected.has(key(current, slot))
          return (
            <button key={slot} onClick={() => toggleCell(current, slot)}
              className={`w-full flex items-center gap-4 px-5 py-4 border-b border-gray-100 text-left transition-colors active:opacity-70
                ${lesson ? 'bg-teal-50' : sel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
              <span className="text-sm font-medium text-gray-500 w-14 flex-shrink-0">{slot}</span>
              <div className={`flex-1 h-2.5 rounded-full ${lesson ? 'bg-teal-400' : sel ? 'bg-blue-400' : 'bg-gray-100'}`} />
              {lesson && <span className="text-xs font-semibold text-teal-600 flex-shrink-0">申込済 ✕</span>}
              {!lesson && sel && <span className="text-xs font-semibold text-blue-600 flex-shrink-0">選択中</span>}
            </button>
          )
        })}
      </div>
    )
  }

  function formatCancelInfo(lesson: Lesson) {
    const d = new Date(lesson.date + 'T12:00:00')
    const dateStr = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
    const timeStr = `${lesson.start_time}〜${lesson.end_time}`
    return { dateStr, timeStr }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold active:bg-gray-200">← 戻る</button>
          <h1 className="text-base font-bold text-gray-800">授業を申し込む</h1>
          {view === 'week' && (
            <button
              onClick={() => setSelectMode(v => !v)}
              className={`md:hidden ml-auto text-sm font-bold px-4 py-2 rounded-xl transition-colors
                ${selectMode ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 border-2 border-blue-200'}`}>
              {selectMode ? '完了' : '複数選択'}
            </button>
          )}
        </div>
        {selectMode && view === 'week' && (
          <div className="md:hidden bg-blue-600 px-4 py-2 text-xs text-white text-center font-medium">
            指をドラッグして複数コマを選べます
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-3 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['month','week','day'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${view === v ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
              </button>
            ))}
          </div>
          <button onClick={navigatePrev} className="bg-gray-100 px-3 py-2 rounded-xl text-sm font-bold active:bg-gray-200">←</button>
          <div className="flex-1 text-center font-bold text-gray-800 text-sm">{displayTitle()}</div>
          <button onClick={navigateNext} className="bg-gray-100 px-3 py-2 rounded-xl text-sm font-bold active:bg-gray-200">→</button>
        </div>

        {view !== 'month' && (
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-blue-400 rounded" />選択中</div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-teal-400 rounded" />申込済（タップで変更・キャンセル）</div>
          </div>
        )}

        {/* 曜日ごとの時間案内 */}
        {view === 'week' && (
          <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
            <div><span className="font-bold">月・水・土</span>：13:00〜21:00</div>
            <div><span className="font-bold">火・木</span>：19:00〜21:00　<span className="font-bold">金</span>：18:00〜21:00</div>
          </div>
        )}

        {view === 'week' && <WeekGrid />}
        {view === 'month' && <MonthGrid />}
        {view === 'day' && <DayList />}

        {msg && (
          <div className={`text-center font-bold py-2 rounded-xl ${msg.includes('失敗') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {msg}
          </div>
        )}

        {view !== 'month' && (
          <button onClick={handleSubmit} disabled={saving || selected.size === 0}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl text-base font-medium active:bg-blue-700 disabled:opacity-50">
            {saving ? '送信中...' : `この内容で申込む（${selected.size}コマ）`}
          </button>
        )}
      </main>

      {cancelModal && (() => {
        const { dateStr, timeStr } = formatCancelInfo(cancelModal)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
              <div className="p-5 space-y-4">
                <h2 className="text-base font-bold text-gray-800">申込み済みの日時</h2>
                <div className="bg-teal-50 rounded-xl p-4 space-y-1">
                  <div className="text-sm font-semibold text-teal-700">{dateStr}</div>
                  <div className="text-lg font-bold text-teal-800">{timeStr}</div>
                </div>
                <p className="text-sm text-gray-500">変更する場合は、この申込みをキャンセルしてから新しい日時を選んでください。</p>
                <div className="space-y-2">
                  <button onClick={() => cancelLesson(cancelModal.id)}
                    className="w-full bg-red-500 text-white py-3 rounded-xl text-sm font-bold active:bg-red-600">
                    この申込みをキャンセルして変更する
                  </button>
                  <button onClick={() => setCancelModal(null)}
                    className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium active:bg-gray-200">
                    このままにする
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
