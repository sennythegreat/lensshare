'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BadgeCheck, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useProfile } from '@/lib/use-profile'
import { initialsOf } from '@/lib/types'
import { UserMenu } from '@/components/user-menu'
import '@/app/browse/browse.css'
import '@/app/dashboard/owner-pages.css'

export function SiteHeadbar({
  breadcrumb,
  subnavRight,
  searchValue,
  onSearchChange,
}: {
  breadcrumb?: string
  subnavRight?: React.ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
}) {
  const pathname = usePathname()
  const { user, profile, loading } = useProfile()
  const isRenter = profile?.role === 'renter'
  const isAdmin = profile?.role === 'admin'
  const isOwner = profile?.role === 'owner'
  // Auth is still resolving: show a neutral placeholder — never "Guest"
  // and never the owner-only earn button before we know who this is.
  const settling = loading && !user
  const guest = !settling && !user
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Account'
  const initials = profile ? initialsOf(profile.full_name) : user ? initialsOf(displayName) : settling ? '·' : 'LS'
  const subtitle = settling
    ? 'Verifying…'
    : !user
      ? 'Browsing as guest'
      : isAdmin
        ? 'Platform admin'
        : isRenter
          ? 'Verified renter'
          : isOwner
            ? 'Verified owner'
            : 'Signed in'

  // Guests and renters use the renter routes (guests get bounced to login).
  // Owners and admins have their own workspaces, so those links are hidden.
  const showRenterLinks = !isOwner && !isAdmin

  const menuLinks = !profile
    ? undefined
    : isAdmin
      ? [{ href: '/admin', label: 'Admin console', icon: ShieldCheck }]
      : isRenter
        ? [{ href: '/renter/profile', label: 'My Profile', icon: UserRound }, { href: '/renter/verification', label: 'Verification', icon: BadgeCheck }]
        : [{ href: '/dashboard/settings', label: 'My Profile', icon: UserRound }]

  const showSubnav = Boolean(breadcrumb || subnavRight)

  return <>
    <header className={onSearchChange ? 'browse-nav' : 'browse-nav browse-nav-compact'}>
      <Link href="/" className="browse-brand"><span className="logo-mark"><img src="/lensshare-logo.png" alt="" /></span><strong>LensShare</strong><small>/ ARCHIVE<br />P2P OPTICAL CO-OP</small></Link>
      <nav>
        <Link className={pathname === '/browse' ? 'active' : ''} href="/browse">Browse Equipment</Link>
        <Link className={pathname === '/packages' ? 'active' : ''} href="/packages">Packages &amp; Tiers</Link>
        {showRenterLinks && <Link className={pathname === '/renter/how-it-works' ? 'active' : ''} href="/renter/how-it-works">How It Works</Link>}
        {showRenterLinks && <Link className={pathname === '/renter/bookings' ? 'active' : ''} href="/renter/bookings">My Bookings</Link>}
      </nav>
      {onSearchChange && <div className="browse-search"><Search size={14} /><input value={searchValue ?? ''} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search equipment or brand..." /></div>}
      {isOwner && <Link className="earn-button" href="/dashboard/listings">+ List Gear / Earn</Link>}
      {guest && <Link className="earn-button" href="/dashboard">+ List Gear / Earn</Link>}
      {settling
        ? <div className="account account-settling"><span>{initials}</span></div>
        : user
          ? <UserMenu initials={initials} name={displayName} subtitle={subtitle} links={menuLinks} triggerClassName="browse-avatar" />
          : <div className="account"><span>{initials}</span><div>Guest<small>{subtitle}</small></div></div>}
    </header>
    {showSubnav && <div className="browse-subnav"><span>Home / Bicol Hub Network / Naga City Region / <b>{breadcrumb ?? 'LensShare'}</b></span>{subnavRight && <span>{subnavRight}</span>}</div>}
  </>
}
