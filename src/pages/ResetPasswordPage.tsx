import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function ResetPasswordPage() {
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setChecking(false)
      return
    }

    let mounted = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) {
        setMessage('The password recovery link could not be verified.')
      }

      setHasSession(Boolean(data.session))
      setChecking(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(Boolean(session))
        setMessage('')
      }

      setChecking(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) return

    setMessage('')
    setSuccess('')

    if (password.length < 10) {
      setMessage('Your password must contain at least 10 characters.')
      return
    }

    if (!/[A-Z]/.test(password)) {
      setMessage('Your password must contain at least one uppercase letter.')
      return
    }

    if (!/[a-z]/.test(password)) {
      setMessage('Your password must contain at least one lowercase letter.')
      return
    }

    if (!/\d/.test(password)) {
      setMessage('Your password must contain at least one number.')
      return
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setMessage('Your password must contain at least one special character.')
      return
    }

    if (password !== confirmPassword) {
      setMessage('The passwords do not match.')
      return
    }

    setSaving(true)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setSuccess('Password updated successfully. Returning to sign in...')

    await supabase.auth.signOut()

    window.setTimeout(() => {
      navigate('/admin', { replace: true })
    }, 1200)
  }

  return (
    <div className="admin-frame">
      <header className="admin-header">
        <div className="page-shell">
          <Brand compact />
          <Link className="button button--outline button--small" to="/">
            View website
          </Link>
        </div>
      </header>

      <main className="page-shell admin-main">
        {!isSupabaseConfigured ? (
          <div className="admin-state">
            <h1>Administration setup required</h1>
            <p>Supabase is not configured.</p>
          </div>
        ) : checking ? (
          <div className="admin-state">
            <h1>Checking recovery link...</h1>
          </div>
        ) : !hasSession ? (
          <div className="login-card">
            <span className="eyebrow">Password recovery</span>
            <h1>Recovery link unavailable</h1>
            <div className="alert alert--error">
              {message || 'This recovery link is invalid or has expired.'}
            </div>
            <Link className="button button--primary button--full" to="/admin">
              Return to sign in
            </Link>
          </div>
        ) : (
          <form className="login-card" onSubmit={handleSubmit}>
            <span className="eyebrow">Password recovery</span>
            <h1>Create a new password</h1>
            <p>Choose a new password for your CKEFA Media administrator account.</p>

            {message ? <div className="alert alert--error">{message}</div> : null}
            {success ? <div className="alert">{success}</div> : null}

            <label className="field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>

            <button
              className="button button--primary button--full"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Updating password...' : 'Update password'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
