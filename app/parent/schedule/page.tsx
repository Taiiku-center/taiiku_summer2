'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { getSession, clearSession, TIME_SLOTS, isSlotAvailable, endTime, toDateStr, PERIOD_START, PERIOD_END, SLOT_CAPACITY, type Lesson, type Student } from '../../lib'
import GuideBox from '../../components/GuideBox'

const DAYS_JP = ['月', '火', '水', '木', '金', '土', '日']
const NOTIFY_EMAIL = 'kusunoki.infinite@gmail.com'

// 分を「X時間Y分」に整形（1コマ=30分）
function formatDuration(min: number) {
  if (min <= 0) return '0分'
  const h = Math.floor(min / 60), m = min % 60
  return `${h > 0 ? `${h}時間` : ''}${m > 0 ? `${m}分` : ''}`
}

function getMondayOf(d: Date) {
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m
}

async function sendEmail(subject: string, body: string) {
  try {
    await fetch(`https://formsubmit.co/ajax/${NOTIFY_EMAIL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ _subject: subject, message: body, _captcha: 'false' }),
    })
  } catch {}
}

type View = 'month' | 'week' | 'day'

export default function SchedulePage() {
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)
  const [existing, setExisting] = useState<Lesson[]>([])
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<View>('week')
  const [current, setCurrent] = useState(() => {
    const t = toDateStr(new Date())
    return t >= PERIOD_START ? new Date() : new Date(PERIOD_START + 'T00:00:00')
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgIsError, setMsgIsError] = useState(false)
  const [cancelModal, setCancelModal] = useState<Lesson | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)

  // スマホ幅では週ビューをデフォルトに
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) setView('week')
  }, [])

  // PC drag
  const dragActive         = useRef(false)
  const paintV             = useRef(true)
  const suppressNextClick  = useRef(false)
  // Touch long press & drag
  const longPressTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressTouchClick = useRef(false)
  // 長押しドラッグ中はページ全体のスクロールを止めてセル選択を優先
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => { if (dragActive.current) e.preventDefault() }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [])

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
  }, [router])

  useEffect(() => { if (student) fetchExisting() }, [student])

  async function fetchExisting() {
    if (!student) return
    const supabase = createClient()
    const [mine, all] = await Promise.all([
      supabase.from('summer_lessons2')
        .select('*').eq('student_id', student.id).neq('status', 'cancelled')
        .gte('date', PERIOD_START).lte('date', PERIOD_END),
      supabase.from('summer_lessons2')
        .select('date,start_time').neq('status', 'cancelled')
        .gte('date', PERIOD_START).lte('date', PERIOD_END),
    ])
    setExisting(mine.data || [])
    setSlotCounts(buildSlotCounts(all.data || []))
  }

  function buildSlotCounts(rows: { date: string; start_time: string }[]) {
    const counts: Record<string, number> = {}
    for (const r of rows) {
      const k = `${r.date}__${r.start_time}`
      counts[k] = (counts[k] || 0) + 1
    }
    return counts
  }

  function existingAt(dateObj: Date, slot: string) {
    const ds = toDateStr(dateObj)
    return existing.find(l => l.date === ds && l.start_time === slot)
  }

  function countAt(dateObj: Date, slot: string) {
    return slotCounts[`${toDateStr(dateObj)}__${slot}`] || 0
  }

  function isFull(dateObj: Date, slot: string) {
    return !existingAt(dateObj, slot) && countAt(dateObj, slot) >= SLOT_CAPACITY
  }

  async function cancelLesson(id: string) {
    const supabase = createClient()
    setExisting(prev => prev.filter(l => l.id !== id))
    setCancelModal(null)
    setCancelConfirm(false)
    await supabase.from('summer_lessons2').delete().eq('id', id)
    setMsg('キャンセルしました。新しい日時を選んで申込みできます')
    setMsgIsError(false)
    setTimeout(() => setMsg(''), 5000)
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

    // 送信直前に最新の空き状況を再確認（他の生徒がその間に予約した可能性があるため）
    const { data: latest } = await supabase.from('summer_lessons2')
      .select('date,start_time').neq('status', 'cancelled')
      .gte('date', PERIOD_START).lte('date', PERIOD_END)
    const latestCounts = buildSlotCounts(latest || [])
    const nowFull = rows.filter(r => (latestCounts[`${r.date}__${r.start_time}`] || 0) >= SLOT_CAPACITY)
    if (nowFull.length > 0) {
      setSaving(false)
      setSlotCounts(latestCounts)
      setMsg('選択した時間の一部が満席になりました。お手数ですが選び直してください')
      setMsgIsError(true)
      setTimeout(() => setMsg(''), 5000)
      return
    }

    const count = rows.length
    const { error } = await supabase.from('summer_lessons2').insert(rows)
    if (!error) {
      await supabase.from('summer_notifications').insert({
        type: 'lesson', title: '新しい授業申込みがありました',
        message: `${student.full_name}（${count}コマ）`, is_read: false,
      })
      for (const row of rows) {
        sendEmail(`【申込】${student.full_name} ${row.date} ${row.start_time}〜`, `${student.full_name} さんが授業を申し込みました。\n日付：${row.date}\n時間：${row.start_time}〜${row.end_time}\n管理画面でご確認ください。`)
      }
    }
    setSaving(false)
    if (error) {
      console.error('lesson insert failed:', error)
      if (error.code === '23503') {
        clearSession()
        router.replace('/login?expired=1')
        return
      }
      setMsg('申込みの送信に失敗しました。再度お試しください。')
      setMsgIsError(true)
      setTimeout(() => setMsg(''), 5000)
    } else {
      setMsg(`✅ ${count}コマの申込みが完了しました`)
      setMsgIsError(false)
      setSelected(new Set())
    }
    await fetchExisting()
  }

  function key(dateObj: Date, slot: string) { return `${toDateStr(dateObj)}__${slot}` }

  function toggleCell(dateObj: Date, slot: string) {
    const lesson = existingAt(dateObj, slot)
    if (lesson) { setCancelModal(lesson); return }
    if (isFull(dateObj, slot)) return
    const k = key(dateObj, slot)
    setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  function paintCell(dateObj: Date, slot: string) {
    if (existingAt(dateObj, slot) || isFull(dateObj, slot)) return
    const k = key(dateObj, slot)
    setSelected(prev => { const n = new Set(prev); paintV.current ? n.add(k) : n.delete(k); return n })
  }

  function isInPeriod(d: Date) { const s = toDateStr(d); return s >= PERIOD_START && s <= PERIOD_END }
  function isBlocked(d: Date, slot: string) { return !isSlotAvailable(d.getDay(), slot) }

  function onCellPointerDown(e: React.PointerEvent, d: Date, slot: string) {
    if (!isInPeriod(d) || isBlocked(d, slot)) return
    if (e.pointerType === 'mouse') {
      suppressNextClick.current = true
      const lesson = existingAt(d, slot)
      if (lesson) { setCancelModal(lesson); return }
      paintV.current = !selected.has(key(d, slot))
      dragActive.current = true
      paintCell(d, slot)
    } else {
      // タッチ: 1.5秒長押しでドラッグ開始
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null
        if (navigator.vibrate) navigator.vibrate(50)
        const lesson = existingAt(d, slot)
        if (lesson) return
        suppressTouchClick.current = true
        paintV.current = !selected.has(key(d, slot))
        dragActive.current = true
        paintCell(d, slot)
      }, 1200)
    }
  }

  function onCellPointerMove(e: React.PointerEvent) {
    if (!dragActive.current) return
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const ds2 = el?.dataset.ds, slot2 = el?.dataset.slot
    if (!ds2 || !slot2) return
    const [y, mo, d2] = ds2.split('-').map(Number)
    paintCell(new Date(y, mo - 1, d2), slot2)
  }

  function onCellPointerUp() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    dragActive.current = false
  }

  function handleCellClick(d: Date, slot: string) {
    if (suppressNextClick.current) { suppressNextClick.current = false; return }
    if (suppressTouchClick.current) { suppressTouchClick.current = false; return }
    if (!isInPeriod(d) || isBlocked(d, slot)) return
    toggleCell(d, slot)
  }

  function canGoPrev() {
    if (view === 'month') return !(current.getFullYear() === 2026 && current.getMonth() === 6)
    if (view === 'week') {
      const mon = getMondayOf(current)
      const prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1)
      return toDateStr(prevSun) >= PERIOD_START
    }
    return toDateStr(current) > PERIOD_START
  }

  function canGoNext() {
    if (view === 'month') return !(current.getFullYear() === 2026 && current.getMonth() === 7)
    if (view === 'week') {
      const mon = getMondayOf(current)
      const nextMon = new Date(mon); nextMon.setDate(mon.getDate() + 7)
      return toDateStr(nextMon) <= PERIOD_END
    }
    return toDateStr(current) < PERIOD_END
  }

  function navigatePrev() {
    if (!canGoPrev()) return
    setCurrent(d => {
      const n = new Date(d)
      if (view === 'month') n.setMonth(n.getMonth() - 1)
      else if (view === 'week') n.setDate(n.getDate() - 7)
      else n.setDate(n.getDate() - 1)
      return n
    })
  }

  function navigateNext() {
    if (!canGoNext()) return
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

  function displayTitle() {
    const wd = weekDates()
    if (view === 'month') return `${current.getFullYear()}年${current.getMonth() + 1}月`
    if (view === 'week') return `${wd[0].getMonth()+1}/${wd[0].getDate()} 〜 ${wd[5].getMonth()+1}/${wd[5].getDate()}`
    const dow = ['日','月','火','水','木','金','土'][current.getDay()]
    return `${current.getMonth()+1}/${current.getDate()}（${dow}）`
  }

  if (!student) return null

  const wd = weekDates()

  function formatCancelInfo(lesson: Lesson) {
    const d = new Date(lesson.date + 'T12:00:00')
    const dateStr = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
    return { dateStr, timeStr: `${lesson.start_time}〜${lesson.end_time}` }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold active:bg-gray-200">← 戻る</button>
          <h1 className="text-base font-bold text-gray-800">授業を申し込む</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 py-4 space-y-4">
        <GuideBox alwaysOpen
          steps={[
            'カレンダーから希望日を選びます。',
            '表示された時間帯から、希望する授業時間を選びます。',
            '複数選べる場合は、必要な時間をすべて選びます。',
            '内容を確認し、「申込む」を押します。',
          ]}
          note="すでに申込み済みの時間は選べない場合があります。"
        />
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
          <button onClick={navigatePrev} disabled={!canGoPrev()}
            className="bg-gray-100 px-3 py-2 rounded-xl text-sm font-bold active:bg-gray-200 disabled:opacity-30">←</button>
          <div className="flex-1 text-center font-bold text-gray-800 text-sm">{displayTitle()}</div>
          <button onClick={navigateNext} disabled={!canGoNext()}
            className="bg-gray-100 px-3 py-2 rounded-xl text-sm font-bold active:bg-gray-200 disabled:opacity-30">→</button>
        </div>

        {view !== 'month' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-blue-400 rounded" />選択中</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-teal-400 rounded" />選択済（タップで変更・キャンセル）</div>
            </div>
            <div className="text-xs text-gray-400">タップで1コマ選択 ／ 長押ししながらドラッグで複数選択</div>
          </div>
        )}

        {/* 週グリッド: JSXをインラインで記述することでstate更新時の再マウントを防止 */}
        {view === 'week' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden select-none">
            <div
              className="overflow-x-auto"
              onContextMenu={e => e.preventDefault()}
              onPointerUp={onCellPointerUp}
              onPointerLeave={onCellPointerUp}>
              <div
                className="min-w-[360px] overflow-y-auto"
                style={{ maxHeight: '65vh', WebkitUserSelect: 'none', userSelect: 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(6, 1fr)' }}>
                  <div className="border-b border-r border-gray-200 bg-white sticky top-0 left-0 z-20" />
                  {wd.slice(0, 6).map((d, i) => {
                    const inP = isInPeriod(d)
                    return (
                      <div key={i} className={`border-b border-r border-gray-200 py-2 text-center text-xs font-bold leading-tight bg-white sticky top-0 z-10
                        ${i===5?'text-blue-500':'text-gray-600'} ${!inP ? 'opacity-30' : ''}`}>
                        {DAYS_JP[i]}<br/><span className="font-normal text-gray-400">{d.getMonth()+1}/{d.getDate()}</span>
                      </div>
                    )
                  })}
                  {TIME_SLOTS.map(slot => (
                    <div key={slot} className="contents">
                      <div className="border-b border-r border-gray-200 flex items-center justify-end pr-1.5 text-xs text-gray-400 h-10 whitespace-nowrap bg-white sticky left-0 z-[5]">
                        {slot}
                      </div>
                      {wd.slice(0, 6).map((d, di) => {
                        const lesson = existingAt(d, slot)
                        const sel = selected.has(key(d, slot))
                        const inP = isInPeriod(d)
                        const blocked = isBlocked(d, slot)
                        const full = inP && !blocked && isFull(d, slot)
                        return (
                          <div key={di}
                            data-ds={toDateStr(d)} data-slot={slot}
                            onPointerDown={e => onCellPointerDown(e, d, slot)}
                            onPointerMove={onCellPointerMove}
                            onPointerUp={onCellPointerUp}
                            onClick={() => handleCellClick(d, slot)}
                            className={`border-b border-r border-gray-200 h-10 transition-colors flex items-center justify-center
                              ${!inP || blocked ? 'bg-gray-50 cursor-not-allowed' :
                                lesson ? 'bg-teal-400 active:bg-teal-300 cursor-pointer' :
                                full ? 'bg-red-50 cursor-not-allowed' :
                                sel ? 'bg-blue-400 cursor-pointer' :
                                'hover:bg-blue-50 active:bg-blue-100 cursor-pointer'}`}
                            style={blocked ? { backgroundImage: 'repeating-linear-gradient(45deg, #d1d5db 0px, #d1d5db 1px, transparent 1px, transparent 6px)' } : undefined}
                          >
                            {full && <span className="text-[9px] font-bold text-red-400 leading-none">満席</span>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 月グリッド */}
        {view === 'month' && (() => {
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
                          dow===6 ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-700 hover:bg-gray-100'}`}>
                      {d.getDate()}
                      {has && inP && <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-teal-500'}`} />}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">
                日付をタップすると週ビューに切り替わります{submittedDates.size > 0 ? '（● = 選択済）' : ''}
              </p>
            </div>
          )
        })()}

        {/* 日リスト */}
        {view === 'day' && (() => {
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
                const full = isFull(current, slot)
                return (
                  <button key={slot} onClick={() => toggleCell(current, slot)} disabled={full && !lesson}
                    className={`w-full flex items-center gap-4 px-5 py-4 border-b border-gray-100 text-left transition-colors active:opacity-70
                      ${lesson ? 'bg-teal-50' : full ? 'bg-red-50 cursor-not-allowed' : sel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <span className="text-sm font-medium text-gray-500 w-14 flex-shrink-0">{slot}</span>
                    <div className={`flex-1 h-2.5 rounded-full ${lesson ? 'bg-teal-400' : full ? 'bg-red-200' : sel ? 'bg-blue-400' : 'bg-gray-100'}`} />
                    {lesson && <span className="text-xs font-semibold text-teal-600 flex-shrink-0">選択済 ✕</span>}
                    {!lesson && full && <span className="text-xs font-semibold text-red-500 flex-shrink-0">満席</span>}
                    {!lesson && !full && sel && <span className="text-xs font-semibold text-blue-600 flex-shrink-0">選択中</span>}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-between gap-3
            ${msgIsError ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            <span>{msg}</span>
            {!msgIsError && (
              <button onClick={() => router.push('/parent/calendar')}
                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0">
                カレンダーで確認 →
              </button>
            )}
          </div>
        )}

        {view !== 'month' && (
          <button onClick={handleSubmit} disabled={saving || selected.size === 0}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl text-base font-medium active:bg-blue-700 disabled:opacity-50">
            {saving ? '送信中...' : view === 'day'
              ? `${displayTitle()}の内容で申込む（${formatDuration(selected.size * 30)}）`
              : `この内容で申込む（${formatDuration(selected.size * 30)}）`}
          </button>
        )}
      </main>

      {cancelModal && (() => {
        const { dateStr, timeStr } = formatCancelInfo(cancelModal)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
              <div className="p-5 space-y-4">
                <h2 className="text-base font-bold text-gray-800">選択済みの日時</h2>
                <div className="bg-teal-50 rounded-xl p-4 space-y-1">
                  <div className="text-sm font-semibold text-teal-700">{dateStr}</div>
                  <div className="text-lg font-bold text-teal-800">{timeStr}</div>
                </div>
                {!cancelConfirm ? (
                  <>
                    <p className="text-sm text-gray-500">変更する場合は、この申込みをキャンセルしてから新しい日時を選んでください。</p>
                    <div className="space-y-2">
                      <button onClick={() => setCancelConfirm(true)}
                        className="w-full bg-red-50 text-red-600 border-2 border-red-200 py-3 rounded-xl text-sm font-bold active:bg-red-100">
                        キャンセルして変更する
                      </button>
                      <button onClick={() => { setCancelModal(null); setCancelConfirm(false) }}
                        className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium active:bg-gray-200">
                        このままにする
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 font-medium text-center">
                      本当にキャンセルしますか？<br/>
                      <span className="text-xs font-normal text-red-500">この操作は取り消せません</span>
                    </div>
                    <div className="space-y-2">
                      <button onClick={() => cancelLesson(cancelModal.id)}
                        className="w-full bg-red-500 text-white py-3 rounded-xl text-sm font-bold active:bg-red-600">
                        はい、キャンセルします
                      </button>
                      <button onClick={() => setCancelConfirm(false)}
                        className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium active:bg-gray-200">
                        やめる
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
