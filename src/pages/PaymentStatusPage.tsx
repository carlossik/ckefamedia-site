import { CheckCircle2, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PaymentStatusPage({ status }: { status: 'success' | 'cancelled' }) {
  const successful = status === 'success'
  return (
    <section className="section status-page"><div className="status-card">
      {successful ? <CheckCircle2 className="status-card__success" /> : <RotateCcw className="status-card__cancel" />}
      <span className="eyebrow">{successful ? 'Payment received' : 'Checkout cancelled'}</span>
      <h1>{successful ? 'Your booking is awaiting confirmation.' : 'Your payment was not completed.'}</h1>
      <p>{successful ? 'The payment provider is confirming the payment securely. CKEFA Media will then make the final operational decision and contact you. Payment alone does not automatically confirm production.' : 'No successful payment was recorded. You can return to the booking journey while the requested time remains available.'}</p>
      <div className="button-row"><Link className="button button--primary" to={successful ? '/' : '/book'}>{successful ? 'Return home' : 'Return to booking'}</Link><Link className="button button--outline" to="/contact">Contact the team</Link></div>
    </div></section>
  )
}
