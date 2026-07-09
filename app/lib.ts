// 授業申込み 共通定義

export const PERIOD_START = '2026-07-20'
export const PERIOD_END   = '2026-08-29'

// 1時間帯（30分）あたりの定員（満席判定に使用）
export const SLOT_CAPACITY = 8

// 表示する全スロット（最大範囲 13:00〜21:00）
export const TIME_SLOTS = [
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30',
]

// 曜日ごとの受講可能時間
// 月(1)/水(3)/土(6): 13:00〜21:00
// 火(2)/木(4): 19:00〜21:00
// 金(5): 18:00〜21:00
// 日(0): なし
export function isSlotAvailable(dow: number, slot: string): boolean {
  if (dow === 1 || dow === 3 || dow === 6) return true
  if (dow === 2 || dow === 4) return slot >= '19:00'
  if (dow === 5) return slot >= '18:00'
  return false
}

export function endTime(start: string): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type Student = {
  id: string
  four_digit_id: string
  full_name: string
}

export type Lesson = {
  id: string
  student_id: string
  full_name: string
  date: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'cancelled'
  created_at: string
}

export const SESSION_KEY = 'summer2_student_session'

export function getSession(): Student | null {
  try {
    const s = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null
    return s ? JSON.parse(s) : null
  } catch { return null }
}

export function setSession(student: Student) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(student))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
