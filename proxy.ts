import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Validates the JWT with the auth server rather than trusting the cookie alone.
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isWorkspace = pathname.startsWith('/dashboard') || pathname.startsWith('/renter')

  if (!user) {
    if (isWorkspace) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = `?redirect=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(url)
    }
    return response
  }

  let role: string | null = null
  try {
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    role = data?.role ?? null
  } catch {
    role = null // schema not applied yet — let requests through rather than brick the app
  }

  const home = role === 'admin' ? '/admin' : role === 'owner' ? '/dashboard' : '/browse'

  if (pathname === '/login' || pathname === '/signup') {
    const url = request.nextUrl.clone()
    url.pathname = home
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/admin') && role !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = home
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (role) {
    if (pathname.startsWith('/dashboard') && role !== 'owner') {
      const url = request.nextUrl.clone()
      url.pathname = role === 'admin' ? '/admin' : '/renter/bookings'
      url.search = ''
      return NextResponse.redirect(url)
    }
    if (pathname.startsWith('/renter') && role !== 'renter') {
      const url = request.nextUrl.clone()
      url.pathname = role === 'admin' ? '/admin' : '/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/renter/:path*', '/admin/:path*', '/login', '/signup'],
}
