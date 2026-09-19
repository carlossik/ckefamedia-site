import { Link } from 'react-router-dom'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? 'brand--compact' : ''}`} to="/" aria-label="CKEFA Media home">
      <img className="brand__logo" src="/ckefa-media-logo.jpeg" alt="CKEFA Media" />
    </Link>
  )
}
