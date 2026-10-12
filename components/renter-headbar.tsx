'use client'

import { SiteHeadbar } from '@/components/site-headbar'
import '../app/dashboard/owner-pages.css'
import '../app/renter/renter.css'

export function RenterHeadbar({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return <div className="owner-page renter-page">
    <SiteHeadbar breadcrumb={title} subnavRight="RENTER · NAGA CITY HUB" />
    <main className="owner-main">
      <div className="owner-content">
        <div className="owner-heading">
          <div>
            <p className="eyebrow">RENTER WORKSPACE · NAGA CITY HUB</p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  </div>
}

export function Status({ children, tone = 'teal' }: { children: React.ReactNode; tone?: string }) { return <span className={`status ${tone}`}>{children}</span> }
