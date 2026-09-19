import { ArrowUpRight, Clapperboard } from 'lucide-react'
import { SectionHeading } from './SectionHeading'

type Product = {
  name: string
  status: 'Live' | 'In development'
  description: string
  href: string | null
  cta: string
  logo?: string
  logoClassName?: string
}

const products: Product[] = [
  {
    name: 'TournamentHQ',
    status: 'Live',
    logo: '/assets/tournamenthq-logo.png',
    logoClassName: 'ecosystem-card__logo--tournamenthq',
    description: 'Run competitions and clubs with fixtures, results, squads, finance, communications and public websites in one platform.',
    href: 'https://tournamenthq.co.uk',
    cta: 'Explore TournamentHQ',
  },
  {
    name: 'First Come First Served',
    status: 'Live',
    logo: '/assets/fcfs-logo.png',
    logoClassName: 'ecosystem-card__logo--fcfs',
    description: 'Simple, fair event registration for organisers who need to allocate limited places quickly and transparently.',
    href: 'https://fcfs.app/home',
    cta: 'Explore FCFS',
  },
  {
    name: 'CKEFAOne',
    status: 'In development',
    description: 'A desktop production tool for organising match footage and producing full games, highlights, social clips and thumbnails.',
    href: null,
    cta: 'Coming soon',
  },
]

export function Ecosystem() {
  return (
    <section className="section ecosystem" id="ecosystem">
      <div className="page-shell">
        <SectionHeading
          eyebrow="Part of the CKEFA ecosystem"
          title="Connected products for sport, events and digital production."
          copy="CKEFA Media works alongside a growing portfolio of products designed around practical community and business needs."
        />
        <div className="ecosystem-grid">
          {products.map((product) => (
            <article className="ecosystem-card" key={product.name}>
              <div className="ecosystem-card__top">
                {product.logo ? (
                  <span className="ecosystem-card__brand">
                    <img
                      src={product.logo}
                      alt={`${product.name} logo`}
                      className={`ecosystem-card__logo ${product.logoClassName ?? ''}`}
                    />
                  </span>
                ) : (
                  <span className="ecosystem-card__icon" aria-hidden="true"><Clapperboard /></span>
                )}
                <span className={`status-pill ${product.status === 'Live' ? 'status-pill--live' : ''}`}>{product.status}</span>
              </div>
              <span className="eyebrow">CKEFA</span>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              {product.href ? (
                <a href={product.href} target="_blank" rel="noreferrer">{product.cta} <ArrowUpRight size={16} /></a>
              ) : (
                <span className="coming-soon">{product.cta}</span>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
