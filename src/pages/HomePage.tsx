import { ArrowRight, CalendarCheck2, Camera, CheckCircle2, MapPin, Play, Radio, ShieldCheck, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ecosystem } from '../components/Ecosystem'
import { SectionHeading } from '../components/SectionHeading'
import { ServiceCard } from '../components/ServiceCard'
import { fallbackServices } from '../data/services'
import { loadServices } from '../lib/booking'
import type { ServicePackage } from '../types'

const FEATURED_VIDEO = {
  id: 'FlcvCYVVJdk',
  title: 'CKEFA Media featured match coverage',
  startSeconds: 537,
}

export function HomePage() {
  const [services, setServices] = useState<ServicePackage[]>(fallbackServices)
  const [videoOpen, setVideoOpen] = useState(false)

  useEffect(() => {
    void loadServices().then(setServices).catch(() => setServices(fallbackServices))
  }, [])

  useEffect(() => {
    if (!videoOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVideoOpen(false)
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [videoOpen])

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero__media" aria-hidden="true" />
        <div className="hero__overlay" aria-hidden="true" />
        <div className="page-shell hero__content">
          <span className="hero__badge"><span /> Grassroots coverage, professionally delivered</span>
          <h1>Every match has a story.<br /><em>We make it visible.</em></h1>
          <p>
            Professional recording, live streaming, highlights and analysis for grassroots football,
            basketball, clubs, players and communities.
          </p>
          <div className="button-row">
            <Link className="button button--primary" to="/book">Check availability <CalendarCheck2 /></Link>
            <button className="button button--ghost" type="button" onClick={() => setVideoOpen(true)}>
              <Play /> Watch our work
            </button>
          </div>
          <div className="hero__proof">
            <span><CheckCircle2 /> Match recording</span>
            <span><CheckCircle2 /> Live production</span>
            <span><CheckCircle2 /> Share-ready edits</span>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="CKEFA Media capabilities">
        <div className="page-shell trust-strip__grid">
          <div><strong>Multi</strong><span>Multiple camera setups available</span></div>
          <div><Radio /><span>Live and recorded match coverage</span></div>
          <div><Users /><span>Built for clubs, players, families and scouts</span></div>
          <div><MapPin /><span>Grassroots knowledge, professional delivery</span></div>
        </div>
      </section>

      <section className="section home-section home-section--services" id="services">
        <div className="page-shell">
          <SectionHeading
            eyebrow="Coverage built around your game"
            title="From kick-off to the final edit."
            copy="Choose the coverage you need, check live availability and reserve a production slot without waiting for an email exchange."
            action={<Link className="text-link" to="/services">View all services <ArrowRight size={17} /></Link>}
          />
          <div className="services-grid">
            {services.slice(0, 6).map((service) => <ServiceCard service={service} key={service.id} />)}
          </div>
        </div>
      </section>

      <section className="section section--dark home-section home-section--work" id="work">
        <div className="page-shell work-grid">
          <div className="work-visual">
            <div className="work-visual__image" />
            <button type="button" className="play-control" onClick={() => setVideoOpen(true)} aria-label="Play a featured CKEFA Media match">
              <Play fill="currentColor" />
            </button>
            <span className="work-visual__tag">Real games. Real communities.</span>
          </div>
          <div>
            <span className="eyebrow">Relive the game. Share the journey.</span>
            <h2>Grassroots sport deserves more than a static scoreline.</h2>
            <p>
              We capture the movement, emotion and decisive moments that players, coaches and families want to see again.
              Every production is prepared for its purpose, from private team analysis to a live public broadcast.
            </p>
            <ul className="feature-list">
              <li><Camera /><span><strong>Reliable coverage</strong>Planned around the venue, competition and audience.</span></li>
              <li><ShieldCheck /><span><strong>Responsible production</strong>Clear booking information and media-consent expectations.</span></li>
              <li><Play /><span><strong>Useful outputs</strong>Full games, highlights, analysis and social-ready content.</span></li>
            </ul>
            <a className="button button--light" href="https://www.youtube.com/@CKEFAMedia" target="_blank" rel="noreferrer">
              Visit the CKEFA Media channel <ArrowRight />
            </a>
          </div>
        </div>
      </section>

      <section className="section process-section home-section home-section--process">
        <div className="page-shell">
          <SectionHeading eyebrow="A clearer booking experience" title="Book coverage in four simple steps." align="centre" />
          <div className="process-grid">
            {[
              ['01', 'Choose coverage', 'Select the service that fits your match or event.'],
              ['02', 'Check the calendar', 'See at a glance whether your preferred date is Available or Unavailable.'],
              ['03', 'Secure the slot', 'Submit the match details and create a provisional booking.'],
              ['04', 'Receive confirmation', 'We verify payment and confirm the booking once the production can be honoured.'],
            ].map(([number, title, copy]) => (
              <article key={number}>
                <span>{number}</span><h3>{title}</h3><p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="centred-action"><Link className="button button--primary" to="/book">Start a booking <ArrowRight /></Link></div>
        </div>
      </section>

      <Ecosystem />

      <section className="final-cta home-section home-section--final">
        <div className="page-shell final-cta__inner">
          <div><span className="eyebrow">The season is starting</span><h2>Make sure the next match is remembered.</h2></div>
          <Link className="button button--primary" to="/book">Check available dates <CalendarCheck2 /></Link>
        </div>
      </section>

      {videoOpen && (
        <div className="video-modal" role="dialog" aria-modal="true" aria-label="CKEFA Media featured video" onClick={() => setVideoOpen(false)}>
          <div className="video-modal__panel" onClick={(event) => event.stopPropagation()}>
            <div className="video-modal__header">
              <div>
                <span className="eyebrow">Featured CKEFA Media coverage</span>
                <strong>{FEATURED_VIDEO.title}</strong>
              </div>
              <button type="button" className="video-modal__close" onClick={() => setVideoOpen(false)} aria-label="Close video">
                <X />
              </button>
            </div>
            <div className="video-modal__frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${FEATURED_VIDEO.id}?autoplay=1&rel=0&start=${FEATURED_VIDEO.startSeconds}`}
                title={FEATURED_VIDEO.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

