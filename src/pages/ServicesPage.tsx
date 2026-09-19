import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../components/SectionHeading'
import { ServiceCard } from '../components/ServiceCard'
import { fallbackServices } from '../data/services'
import { loadServices } from '../lib/booking'
import type { ServicePackage } from '../types'

export function ServicesPage() {
  const [services, setServices] = useState<ServicePackage[]>(fallbackServices)
  useEffect(() => { void loadServices().then(setServices).catch(() => setServices(fallbackServices)) }, [])

  return (
    <>
      <section className="page-hero"><div className="page-shell"><span className="eyebrow">Services</span><h1>Coverage for the way your game will be watched.</h1><p>From a single fixture to a full tournament, build the right production package and reserve an available date.</p></div></section>
      <section className="section"><div className="page-shell">
        <SectionHeading eyebrow="Choose your coverage" title="Professional output without losing the grassroots character." />
        <div className="services-grid">{services.map((service) => <ServiceCard key={service.id} service={service} />)}</div>
        <div className="quote-panel"><div><span className="eyebrow">Clubs, leagues and tournaments</span><h2>Need repeat or multi-pitch coverage?</h2><p>Seasonal and event packages can be planned around your fixture programme, production requirements and budget.</p></div><Link className="button button--primary" to="/contact">Discuss a partnership</Link></div>
      </div></section>
    </>
  )
}
