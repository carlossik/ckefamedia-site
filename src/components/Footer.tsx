import { Instagram, Mail, Phone, Youtube } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from './Brand'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-shell footer-grid">
        <div>
          <Brand compact />
          <p className="footer-summary">Relive the game. Share the journey.</p>
          <p className="footer-muted">Professional media coverage built around grassroots sport.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link to="/services">Services</Link>
          <Link to="/book">Book coverage</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/admin">Admin sign-in</Link>
        </div>
        <div>
          <h2>CKEFA ecosystem</h2>
          <a href="https://tournamenthq.co.uk" target="_blank" rel="noreferrer">TournamentHQ</a>
          <a href="https://fcfs.app/home" target="_blank" rel="noreferrer">First Come First Served</a>
          <span>CKEFAOne · In development</span>
        </div>
        <div>
          <h2>Contact</h2>
          <a href="mailto:info@ckefamedia.com"><Mail size={16} /> info@ckefamedia.com</a>
          <a href="tel:+447951750370"><Phone size={16} /> +44 7951 750370</a>
          <a href="https://www.youtube.com/@CKEFAMedia" target="_blank" rel="noreferrer"><Youtube size={16} /> YouTube</a>
          <span><Instagram size={16} /> Instagram link coming soon</span>
        </div>
      </div>
      <div className="page-shell footer-bottom">
        <span>© {new Date().getFullYear()} CKEFA Media. All rights reserved.</span>
        <span>Part of the CKEFA ecosystem: software, AI, events and grassroots sports media.</span>
      </div>
    </footer>
  )
}
