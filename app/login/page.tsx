'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase'
import { setSession } from '../lib'
import GuideBox from '../components/GuideBox'

export default function LoginPage() {
  const [fourDigitId, setFourDigitId] = useState('')
  const [lastName, setLastName]       = useState('')
  const [firstName, setFirstName]     = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const router = useRouter()

  async function handleLogin() {
    if (fourDigitId.length !== 4 || !lastName.trim() || !firstName.trim()) {
      setError('4桁のIDと姓・名を入力してください')
      return
    }
    setLoading(true)
    setError('')
    const fullName = `${lastName.trim()} ${firstName.trim()}`
    try {
      const supabase = createClient()
      const { data, error: dbErr } = await supabase
        .from('summer_students')
        .select('*')
        .eq('four_digit_id', fourDigitId)
        .eq('full_name', fullName)
        .single()
      if (dbErr || !data) {
        setError('4桁のIDかお名前が違います。ご確認いただくか、塾にお問い合わせください')
        setLoading(false)
        return
      }
      setSession(data)
      router.push('/parent')
    } catch {
      setError('通信エラーが発生しました。再度お試しください')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mb-3">
        <GuideBox
          steps={[
            'ログイン画面を開きます。',
            '配布された4桁の番号を入力します。',
            '生徒氏名を入力します。',
            '「ログイン」を押します。',
          ]}
          note="入力内容が分からない場合は、教室までお問い合わせください。"
        />
      </div>
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">☀️</div>
          <h1 className="text-2xl font-bold text-gray-800">夏期講習</h1>
          <p className="text-sm text-gray-400 mt-1">2026年 大育進学センター</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">4桁の数字ID</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={fourDigitId}
              onChange={e => setFourDigitId(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="w-full text-4xl font-bold text-center border-2 border-gray-200 rounded-2xl py-5 px-4 focus:outline-none focus:border-blue-400 tracking-[0.5em] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">生徒のお名前</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1.5 text-center">姓（苗字）</p>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="大育"
                  className="w-full text-2xl text-center border-2 border-gray-200 rounded-2xl py-4 px-2 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5 text-center">名（名前）</p>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="太郎"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full text-2xl text-center border-2 border-gray-200 rounded-2xl py-4 px-2 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 text-center font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || fourDigitId.length !== 4 || !lastName.trim() || !firstName.trim()}
            className="w-full bg-blue-600 text-white font-bold text-lg py-5 rounded-2xl disabled:opacity-40 active:scale-95 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 mt-2">
            {loading ? '確認中...' : 'ログインする'}
          </button>
        </div>
      </div>
      <p className="text-xs text-blue-300 mt-6">IDが分からない場合は塾にお問い合わせください</p>
    </div>
  )
}
