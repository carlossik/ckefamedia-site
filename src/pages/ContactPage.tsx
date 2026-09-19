import { Mail, MapPin, Phone, Youtube } from 'lucide-react'
import { Link } from 'react-router-dom'

export function ContactPage() {
  return (
    <>
      <section className="page-hero"><div className="page-shell"><span className="eyebrow">Contact CKEFA Media</span><h1>Tell us what you are planning.</h1><p>For a date-specific match or event, use the booking calendar. For partnerships and general questions, contact the team directly.</p></div></section>
      <section className="section"><div className="page-shell contact-grid">
        <div className="contact-panel">
          <span className="eyebrow">Direct contact</span><h2>Speak to the production team.</h2>
          <a href="mailto:info@ckefamedia.com"><Mail /><span><strong>Email</strong>info@ckefamedia.com</span></a>
          <a href="tel:+447951750370"><Phone /><span><strong>Telephone</strong>+44 7951 750370</span></a>
          <div><MapPin /><span><strong>Coverage area</strong>UK grassroots football and sporting events</span></div>
          <a href="https://www.youtube.com/@CKEFAMedia" target="_blank" rel="noreferrer"><Youtube /><span><strong>Our work</strong>Watch CKEFA Media on YouTube</span></a>
        </div>
        <div className="contact-card"><span className="eyebrow">Book a date</span><h2>Know when the match is taking place?</h2><p>The live calendar is the fastest way to select a service, check production capacity and secure the date.</p><Link className="button button--primary" to="/book">Open booking calendar</Link><small>Bookings are only confirmed after the required payment succeeds.</small></div>
      </div></section>
    </>
  )
}
