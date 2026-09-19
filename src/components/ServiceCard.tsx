import { ArrowUpRight, Camera, ChartNoAxesCombined, Clapperboard, Radio, Sparkles, Trophy, UserRoundSearch } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ServicePackage } from '../types'
import { formatMoney } from '../lib/format'

const icons = {
  'match-recording': Camera,
  'live-streaming': Radio,
  'recording-highlights': Clapperboard,
  'player-reel': UserRoundSearch,
  'game-analysis': ChartNoAxesCombined,
  photography: Sparkles,
  'event-coverage': Trophy,
}

export function ServiceCard({ service }: { service: ServicePackage }) {
  const Icon = icons[service.slug as keyof typeof icons] ?? Camera
  return (
    <article className="service-card">
      <div className="service-card__icon"><Icon /></div>
      <div>
        <h3>{service.name}</h3>
        <p>{service.short_description}</p>
      </div>
      <div className="service-card__footer">
        <span>{formatMoney(service.price_pence)}</span>
        <Link to={`/book?service=${service.slug}`} aria-label={`Book ${service.name}`}>
          Book <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  )
}
