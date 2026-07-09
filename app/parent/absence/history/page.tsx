'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { getSession, type Student } from '../../../lib'
import GuideBox from '../../../components/GuideBox'

type AbsenceRecord = {
  id: string
  date: string
  time: string
  type: string
  make_up_request: string
  note: string
  created_at: string
}

function formatDate(ds: string) {
  return new Date(ds + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

const TYPE_COLOR: Record<string, string> = {
  '欠席': 'bg-orange-100 text-orange-700',
  '遅刻': 'bg-yellow-100 text-yellow-700',
  'キャンセル': 'bg-gray-100 text-gray-600',
}

export default function AbsenceHistoryPage() {
  const router = useRouter()
  const [student, setStudent]       = useState<Student | null>(null)
  const [records, setRecords]       = useState<AbsenceRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    const s = getSession()
    if (!s) { router.replace('/login'); return }
    setStudent(s)
    fetchRecords(s)
  }, [router])

  async function fetchRecords(s: Student) {
    const supabase = createClient()
    const { data } = await supabase
      .from('summer_absences')
      .select('id, date, time, type, make_up_request, note, created_at')
      .eq('student_id', s.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    setDeleteError('')
    const supabase = createClient()
    const { error } = await supabase.from('summer_absences').delete().eq('id', id)
    if (error) {
      setDeleteError('取り消しに失敗しました。再度お試しください。')
      setDeleting(false)
      return
    }
    setRecords(prev => prev.filter(r => r.id !== id))
    setConfirmId(null)
    setDeleting(false)
  }

  if (!student) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-xl transition-colors">‹</button>
        <div>
          <h1 className="text-base font-bold text-gray-800">欠席・遅刻の履歴</h1>
          <p className="text-xs text-gray-400">{student.full_name}</p>
        </div>
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto space-y-3">
        <GuideBox alwaysOpen
          steps={[
            '過去に送信した欠席・遅刻連絡を確認します。',
            '日付、時間、内容に間違いがないか確認してください。',
          ]}
          note="修正が必要な場合は、教室までお問い合わせください。"
        />
        {deleteError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 text-center">{deleteError}</div>
        )}
        {loading ? (
          <div className="text-center text-gray-400 py-16">読み込み中...</div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            連絡の履歴はありません
          </div>
        ) : records.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_COLOR[r.type] || 'bg-gray-100 text-gray-600'}`}>
                    {r.type}
                  </span>
                  {r.make_up_request === '希望する' && (
                    <span className="text-xs bg-blue-100 text-blue-600 font-bold px-2 py-0.5 rounded-full">振替希望</span>
                  )}
                </div>
                <div className="text-sm font-semibold text-gray-800">{formatDate(r.date)}</div>
                <div className="text-sm text-gray-500">{r.time}〜</div>
                {r.note && <div className="text-xs text-gray-400 mt-1 truncate">{r.note}</div>}
              </div>
              <button
                onClick={() => { setConfirmId(confirmId === r.id ? null : r.id); setDeleteError('') }}
                disabled={deleting}
                className="flex-shrink-0 text-xs text-red-400 border border-red-200 px-3 py-1.5 rounded-lg active:bg-red-50 transition-colors disabled:opacity-40">
                取り消し
              </button>
            </div>

            {confirmId === r.id && (
              <div className="border-t border-red-100 bg-red-50 px-5 py-4 space-y-3">
                <p className="text-sm text-red-600 font-medium">この連絡を取り消しますか？</p>
                <div className="flex gap-2">
                  <button onClick={() => handleDelete(r.id)} disabled={deleting}
                    className="flex-1 bg-red-500 text-white text-sm font-bold py-2.5 rounded-xl active:bg-red-600 disabled:opacity-40">
                    {deleting ? '取り消し中...' : '取り消す'}
                  </button>
                  <button onClick={() => setConfirmId(null)}
                    className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl active:bg-gray-50">
                    やめる
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  )
}
