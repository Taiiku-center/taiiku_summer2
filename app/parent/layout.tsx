'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase'
import { getSession, clearSession } from '../lib'

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const s = getSession()
      if (!s) { router.replace('/login'); return }
      const supabase = createClient()
      const { data } = await supabase.from('summer_students').select('id').eq('id', s.id).maybeSingle()
      if (cancelled) return
      if (!data) {
        clearSession()
        router.replace('/login?expired=1')
        return
      }
      setChecked(true)
    }
    check()
    return () => { cancelled = true }
  }, [router])

  if (!checked) return null

  return <>{children}</>
}
