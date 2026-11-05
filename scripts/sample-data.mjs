#!/usr/bin/env node
//
// LensShare one-command sample data seeder.
//
//   corepack pnpm sample:data
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env (Supabase Dashboard -> Settings
// -> API -> service_role). The key is used ONLY by this local script to create
// the sample auth users and seed base rows; every workflow-v2, verification
// review, Saver Pass, deposit, transfer, and inspection write goes through the
// real RPCs with signed-in sample sessions so RLS policies are exercised.
//
// Non-destructive: every row carries a deterministic sample identifier and
// status moves are forward-only. Rerunning repairs or completes the dataset;
// it never deletes or rewinds non-sample records.

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

const root = process.cwd()
const SAMPLE_PASSWORD = 'demo1234'

const ACCOUNTS = {
  owner: { email: 'lensshare.owner@example.com', name: 'Mateo Rossi', role: 'owner', phone: '+63 917 000 0101', address: 'SAMPLE — Naga City, Camarines Sur' },
  renter: { email: 'lensshare.renter@example.com', name: 'Julian Valdez', role: 'renter', phone: '+63 917 000 0202', address: 'SAMPLE — Naga City, Camarines Sur' },
  renter2: { email: 'lensshare.renter2@example.com', name: 'Andrea Lim', role: 'renter', phone: '+63 917 000 0404', address: 'SAMPLE — Naga City, Camarines Sur' },
  admin: { email: 'lensshare.admin@example.com', name: 'Naga Hub Operator', role: 'admin', phone: '+63 917 000 0303', address: null },
}

// Deterministic sample identifiers.
const LISTINGS = {
  sony: '5a110001-0000-4000-8000-000000000001',
  fuji: '5a110001-0000-4000-8000-000000000002',
  sigma: '5a110001-0000-4000-8000-000000000003',
  godox: '5a110001-0000-4000-8000-000000000004',
  dji: '5a110001-0000-4000-8000-000000000005',
  rode: '5a110001-0000-4000-8000-000000000006',
  canon: '5a110001-0000-4000-8000-000000000007',
}
const LISTING_FIXTURES = [
  { key: 'sony', name: 'Sony ZV-E10 Creator Kit', brand: 'Sony', category: 'Cameras', meta: 'SAMPLE · APS-C VLOGGING KIT', specs: '4K 30p · E-mount · flip screen', included: '16-50mm lens, 2 batteries, mini tripod', description: 'Synthetic showcase listing for student films and creator shoots.', daily_rate: 450.0, image: '/lensshare-camera.png', status: 'available', serial: 'SAMPLE-SONY-ZVE10-001', tag: 'LS-SAMPLE-001' },
  { key: 'fuji', name: 'Fujifilm X-T30 II Kit', brand: 'Fujifilm', category: 'Cameras', meta: 'SAMPLE · EVERYDAY MIRRORLESS', specs: '26.1MP · film simulations · 4K', included: '35mm f/2 lens, strap, spare battery', description: 'Synthetic showcase listing for documentary and street photography.', daily_rate: 600.0, image: '/camera-fujifilm.png', status: 'available', serial: 'SAMPLE-FUJI-XT30-002', tag: 'LS-SAMPLE-002' },
  { key: 'sigma', name: 'Sigma 16mm f/1.4 Lens', brand: 'Sigma', category: 'Lenses', meta: 'SAMPLE · FAST PRIME', specs: 'Sony E · f/1.4 · 24mm equivalent', included: 'Front and rear caps, 67mm filter', description: 'Synthetic wide prime listing for low-light campus coverage.', daily_rate: 350.0, image: '/camera-lens.png', status: 'available', serial: 'SAMPLE-SIGMA-16-003', tag: 'LS-SAMPLE-003' },
  { key: 'godox', name: 'Godox SL60W Lighting Kit', brand: 'Godox', category: 'Lighting', meta: 'SAMPLE · CONTINUOUS LIGHT', specs: '5600K · Bowens mount · CRI 93+', included: 'Softbox, grid, stand, power cable', description: 'Synthetic studio lighting package for interviews and short films.', daily_rate: 300.0, image: '/camera-light.png', status: 'available', serial: 'SAMPLE-GODOX-SL60-004', tag: 'LS-SAMPLE-004' },
  { key: 'dji', name: 'DJI RS3 Mini Gimbal', brand: 'DJI', category: 'Support', meta: 'SAMPLE · 3-AXIS STABILIZER', specs: '2kg payload · vertical mode', included: 'Quick-release plate, USB-C cable, case', description: 'Synthetic support listing for smooth event and wedding footage.', daily_rate: 400.0, image: '/lensshare-camera.png', status: 'available', serial: 'SAMPLE-DJI-RS3-005', tag: 'LS-SAMPLE-005' },
  { key: 'rode', name: 'Rode Wireless GO II', brand: 'Rode', category: 'Audio', meta: 'SAMPLE · DUAL WIRELESS AUDIO', specs: 'Dual channel · onboard recording', included: '2 transmitters, receiver, windscreens, pouch', description: 'Synthetic audio listing for interviews and field reporting.', daily_rate: 350.0, image: '/camera-audio.png', status: 'available', serial: 'SAMPLE-RODE-WGO2-006', tag: 'LS-SAMPLE-006' },
  { key: 'canon', name: 'Canon EOS R50 Kit', brand: 'Canon', category: 'Cameras', meta: 'SAMPLE · HYBRID CREATOR KIT', specs: '24.2MP · 4K · Dual Pixel AF', included: '18-45mm lens, battery, charger', description: 'Synthetic spare catalog item shown as temporarily paused.', daily_rate: 500.0, image: '/placeholder.jpg', status: 'paused', serial: 'SAMPLE-CANON-R50-007', tag: 'LS-SAMPLE-007' },
]

const VERIFICATION_FIXTURES = {
  renter: [
    { id: '5a120001-0000-4000-8000-000000000001', doc_type: 'government_id', file: 'sample-government-id.png', ageDays: 6 },
    { id: '5a120001-0000-4000-8000-000000000002', doc_type: 'selfie', file: 'sample-selfie.png', ageDays: 5 },
    { id: '5a120001-0000-4000-8000-000000000003', doc_type: 'student_id', file: 'sample-student-id.png', ageDays: 4 },
    { id: '5a120001-0000-4000-8000-000000000004', doc_type: 'proof_of_enrollment', file: 'sample-enrollment.png', ageDays: 3 },
  ],
  renter2: [
    { id: '5a120002-0000-4000-8000-000000000001', doc_type: 'government_id', file: 'sample-government-id.png', ageDays: 5 },
    { id: '5a120002-0000-4000-8000-000000000002', doc_type: 'selfie', file: 'sample-selfie.png', ageDays: 4 },
  ],
}

// Legacy workflow-v1 bookings covering every dashboard status. Dates are
// relative to today so the dataset stays useful whenever it is installed.
const V1_BOOKINGS = [
  { id: '5a130001-0000-4000-8000-000000000001', listing: 'sony', start: 28, end: 31, description: 'SAMPLE — upcoming campus journalism coverage.', target: 'pending' },
  { id: '5a130001-0000-4000-8000-000000000002', listing: 'fuji', start: 20, end: 22, description: 'SAMPLE — approved documentary shoot.', target: 'approved' },
  { id: '5a130001-0000-4000-8000-000000000003', listing: 'sigma', start: -1, end: 2, description: 'SAMPLE — active evening photo walk.', target: 'active' },
  { id: '5a130001-0000-4000-8000-000000000004', listing: 'godox', start: -5, end: -3, description: 'SAMPLE — returned interview lighting kit.', target: 'returned' },
  { id: '5a130001-0000-4000-8000-000000000005', listing: 'dji', start: -20, end: -18, description: 'SAMPLE — completed event production.', target: 'completed' },
  { id: '5a130001-0000-4000-8000-000000000006', listing: 'rode', start: 10, end: 11, description: 'SAMPLE — declined audio request retained for history.', target: 'declined' },
]
const V1_ORDER = ['pending', 'approved', 'active', 'returned', 'completed']

const V1_HANDOFFS = [
  { booking: '5a130001-0000-4000-8000-000000000003', party: 'owner', stage: 'agreement', checklist: { accepted: true, sample: true } },
  { booking: '5a130001-0000-4000-8000-000000000003', party: 'renter', stage: 'agreement', checklist: { accepted: true, sample: true } },
  { booking: '5a130001-0000-4000-8000-000000000003', party: 'owner', stage: 'pickup', checklist: { camera_body: true, lens: true, battery: true, sample: true } },
  { booking: '5a130001-0000-4000-8000-000000000004', party: 'renter', stage: 'return', checklist: { light: true, softbox: true, stand: true, sample: true } },
  { booking: '5a130001-0000-4000-8000-000000000005', party: 'owner', stage: 'agreement', checklist: { accepted: true, sample: true } },
  { booking: '5a130001-0000-4000-8000-000000000005', party: 'renter', stage: 'agreement', checklist: { accepted: true, sample: true } },
]

const MESSAGES = [
  { id: '5a140001-0000-4000-8000-000000000001', booking: '5a130001-0000-4000-8000-000000000001', sender: 'renter', body: 'Hi! This is a SAMPLE thread. Is the kit available for our campus coverage?', readAfterDays: 3, ageDays: 4 },
  { id: '5a140001-0000-4000-8000-000000000002', booking: '5a130001-0000-4000-8000-000000000001', sender: 'owner', body: 'Yes, the sample kit is available. Please keep pickup within the Naga hub schedule.', readAfterDays: null, ageDays: 3 },
  { id: '5a140001-0000-4000-8000-000000000003', booking: '5a130001-0000-4000-8000-000000000003', sender: 'owner', body: 'SAMPLE reminder: the spare battery is inside the side pocket.', readAfterDays: 0.5, ageDays: 1 },
  { id: '5a140001-0000-4000-8000-000000000004', booking: '5a130001-0000-4000-8000-000000000003', sender: 'renter', body: 'Received. The sample gear is working well—thank you!', readAfterDays: null, ageDays: 0.5 },
]

const REVIEWS = [
  { id: '5a150001-0000-4000-8000-000000000001', booking: '5a130001-0000-4000-8000-000000000005', listing: 'dji', reviewer: 'renter', reviewee: 'owner', rating: 5, comment: 'SAMPLE REVIEW — Smooth hub handoff and well-prepared equipment.' },
  { id: '5a150001-0000-4000-8000-000000000002', booking: '5a130001-0000-4000-8000-000000000005', listing: 'dji', reviewer: 'owner', reviewee: 'renter', rating: 5, comment: 'SAMPLE REVIEW — Returned on time and followed the checklist carefully.' },
]

// Workflow-v2 scenarios. Existing sample bookings are located by these
// distinctive shoot descriptions, so reruns reuse instead of recreating.
const V2_RENTER = {
  pending: { listing: 'rode', start: 42, end: 44, description: 'SAMPLE V2 — pending Naga hub request.', through: 'approved' },
  approved: { listing: 'fuji', start: 34, end: 36, description: 'SAMPLE V2 — approved request awaiting student hub handoff.', through: 'approved' },
  active: { listing: 'sony', start: 48, end: 51, description: 'SAMPLE V2 — active student rental with full pre-release evidence.', through: 'active' },
}
const V2_RENTER2 = {
  depositReview: { listing: 'dji', start: 30, end: 32, description: 'SAMPLE V2 — deposit proof awaiting admin review.', through: 'approved', deposit: 'held' },
  depositAwaiting: { listing: 'sigma', start: 58, end: 60, description: 'SAMPLE V2 — approved request with deposit awaiting payment.', through: 'approved', deposit: 'awaiting' },
  completed: { listing: 'godox', start: 63, end: 65, description: 'SAMPLE V2 — completed hub rental with refund and payout.', through: 'completed', deposit: 'refunded' },
  forfeit: { listing: 'sony', start: 66, end: 68, description: 'SAMPLE V2 — active rental held for a sample damage incident.', through: 'active', deposit: 'forfeited' },
}

function readEnv() {
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) throw new Error(`No .env found at ${envPath}`)
  const values = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return values
}

function ask(question, { mask = false } = {}) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (!mask) {
      terminal.question(question, (answer) => { terminal.close(); resolve(answer.trim()) })
      return
    }
    let muted = false
    terminal._writeToOutput = function (chunk) {
      if (!muted) terminal.output.write(chunk)
    }
    terminal.question(question, (answer) => { terminal.close(); process.stdout.write('\n'); resolve(answer.trim()) })
    muted = true
  })
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(url, key, role, passwords) {
  const account = ACCOUNTS[role]
  const password = process.env[`LENSSHARE_${role.toUpperCase()}_PASSWORD`]
    || passwords[role]
    || await ask(`${account.name} (${account.email}) password [${SAMPLE_PASSWORD}]: `, { mask: true })
    || SAMPLE_PASSWORD
  passwords[role] = password
  const supabase = client(url, key)
  const { data, error } = await supabase.auth.signInWithPassword({ email: account.email, password })
  if (error) throw new Error(`${account.email}: ${error.message}`)
  console.log(`✓ Signed in as ${account.name}`)
  return { supabase, user: data.user }
}

function daysBetween(startDate, endDate) {
  const a = new Date(`${startDate}T00:00:00Z`)
  const b = new Date(`${endDate}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

function manilaDate(offsetDays) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
  const now = new Date()
  now.setUTCDate(now.getUTCDate() + offsetDays)
  return formatter.format(now)
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString()
}

// ------------------------------------------------------------------
// Synthetic watermarked PNG generation
// ------------------------------------------------------------------

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, payload) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])))
  return Buffer.concat([length, name, payload, checksum])
}

const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'], J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'], X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'], '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'], '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'], '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'], '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'], '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'], ':': ['00000','00100','00100','00000','00100','00100','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'], '/': ['00001','00010','00100','01000','10000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
}

function samplePng(title, subtitle) {
  const width = 960
  const height = 600
  const pixels = Buffer.alloc(width * height * 4)
  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const offset = (y * width + x) * 4
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255
  }
  const fill = (x, y, w, h, color) => {
    for (let row = y; row < y + h; row += 1) for (let col = x; col < x + w; col += 1) setPixel(col, row, color)
  }
  const text = (value, x, y, scale, color) => {
    let cursor = x
    for (const raw of value.toUpperCase()) {
      const glyph = FONT[raw] || FONT[' ']
      glyph.forEach((line, row) => [...line].forEach((on, col) => {
        if (on === '1') fill(cursor + col * scale, y + row * scale, scale, scale, color)
      }))
      cursor += 6 * scale
    }
  }

  fill(0, 0, width, height, [248, 248, 245])
  fill(0, 0, width, 80, [7, 16, 14])
  fill(55, 120, 850, 350, [225, 236, 230])
  fill(72, 137, 816, 316, [248, 248, 245])
  text('LENSSHARE', 55, 26, 5, [248, 248, 245])
  text(title, 100, 170, 7, [7, 16, 14])
  text(subtitle, 100, 265, 4, [43, 82, 71])
  text('SAMPLE - NOT A REAL ID', 100, 360, 6, [174, 54, 45])
  text('FOR DEMO AND TESTING ONLY', 100, 425, 4, [7, 16, 14])
  text('NO REAL PERSONAL DATA', 280, 525, 4, [90, 102, 98])

  const rows = []
  for (let y = 0; y < height; y += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4)]))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// Private evidence buckets (verification-docs, deposit-proofs,
// inspection-photos, incident-photos, promo-payment-proofs) are append-only:
// no update policy. Check for the object first, and only upload when missing,
// so reruns repair instead of failing.
async function objectExists(supabase, bucket, path) {
  const parts = path.split('/')
  const folder = parts.slice(0, -1).join('/')
  const name = parts[parts.length - 1]
  const { data, error } = await supabase.storage.from(bucket).list(folder, { search: name })
  if (error) return false
  return Array.isArray(data) && data.some((item) => item.name === name)
}

async function uploadSample(supabase, bucket, path, title, subtitle) {
  if (await objectExists(supabase, bucket, path)) return path
  const body = samplePng(title, subtitle)
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: 'image/png',
    cacheControl: '3600',
  })
  if (error && !/exist|duplicate/i.test(error.message ?? '')) {
    throw new Error(`${bucket}/${path}: ${error.message}`)
  }
  return path
}

// ------------------------------------------------------------------
// Phase A — service-role base rows (users, profiles, hub, listings,
// verifications, legacy bookings, handoffs, messages, reviews)
// ------------------------------------------------------------------

async function findUserByEmail(service, email) {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (match) return match
    if (data.users.length < 200) break
  }
  return null
}

async function ensureUsers(service) {
  const ids = {}
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    const existing = await findUserByEmail(service, account.email)
    if (existing) {
      if (!existing.email_confirmed_at) {
        const { error } = await service.auth.admin.updateUserById(existing.id, { email_confirm: true })
        if (error) throw new Error(`confirm ${account.email}: ${error.message}`)
      }
      ids[key] = existing.id
    } else {
      // The signup trigger honors only owner/renter metadata; the admin role is
      // assigned afterwards by seedProfiles through the service client.
      const { data: created, error } = await service.auth.admin.createUser({
        email: account.email,
        password: SAMPLE_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: account.name, role: account.role === 'admin' ? 'renter' : account.role },
      })
      if (error) throw new Error(`create ${account.email}: ${error.message}`)
      ids[key] = created.user.id
    }
    console.log(`✓ Account ready: ${account.name} <${account.email}>`)
  }
  return ids
}

async function seedProfiles(service, ids) {
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    const { error } = await service.from('profiles').update({
      full_name: account.name,
      phone: account.phone,
      address: account.address,
      email: account.email,
      role: account.role,
      is_student: key === 'renter',
      primary_rental_use: key === 'renter' ? 'campus_journalism' : key === 'renter2' ? 'freelance_client_productions' : null,
      updated_at: new Date().toISOString(),
    }).eq('id', ids[key])
    if (error) throw new Error(`profile ${account.email}: ${error.message}`)
  }
  console.log('✓ Sample profiles assigned (owner / renter / renter2 / admin roles)')
}

async function seedHub(service) {
  const values = {
    name: 'LensShare Naga Hub',
    city: 'Naga City',
    province: 'Camarines Sur',
    address_text: 'Naga City, Camarines Sur — SAMPLE HUB',
    hub_latitude: 13.6218,
    hub_longitude: 123.1948,
    service_radius_km: 15.0,
    contact_phone: '+63 917 000 0303',
    instructions: '{"operating_hours":"Mon-Sat, 9:00 AM-6:00 PM","location_notes":"Bring the booking QR and one valid ID. This is sample hub information.","gcash_account_name":"LENSSHARE SAMPLE ONLY","gcash_mobile_number":"09XX XXX XXXX","deposit_policy":"Manual sample proof review; never send real money."}',
    standard_deposit: 2000.0,
    is_active: true,
    updated_at: new Date().toISOString(),
  }
  const { data } = await service.from('rental_hubs').update(values).eq('code', 'naga').select('id')
  if (!data?.length) {
    const { error } = await service.from('rental_hubs').insert({ code: 'naga', timezone: 'Asia/Manila', currency: 'PHP', ...values })
    if (error) throw new Error(`rental_hubs: ${error.message}`)
  }
  console.log('✓ Naga hub configured with sample settings')
}

async function seedListings(service, ownerId) {
  const rows = LISTING_FIXTURES.map((fixture) => ({
    id: LISTINGS[fixture.key],
    owner_id: ownerId,
    name: fixture.name,
    brand: fixture.brand,
    category: fixture.category,
    meta: fixture.meta,
    specs: fixture.specs,
    included: fixture.included,
    description: fixture.description,
    daily_rate: fixture.daily_rate,
    image_url: fixture.image,
    image_urls: [fixture.image],
    pickup_address: 'Naga City',
    pickup_latitude: 13.62,
    pickup_longitude: 123.19,
    status: fixture.status,
  }))
  const { error } = await service.from('gear_listings').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`gear_listings: ${error.message}`)
  console.log(`✓ ${rows.length} sample listings seeded across every category`)
}

async function seedAssets(service) {
  const rows = LISTING_FIXTURES.map((fixture) => ({
    listing_id: LISTINGS[fixture.key],
    serial_number: fixture.serial,
    asset_tag: fixture.tag,
    acquisition_note: 'SAMPLE DATA — synthetic inventory record',
  }))
  const { error } = await service.from('listing_assets').upsert(rows, { onConflict: 'listing_id' })
  if (error) throw new Error(`listing_assets: ${error.message}`)
  console.log(`✓ ${rows.length} private sample serials registered`)
}

async function seedBlackouts(service, ownerId) {
  const rows = [18, 19].map((offset) => ({
    listing_id: LISTINGS.rode,
    owner_id: ownerId,
    blackout_date: manilaDate(offset),
    note: 'SAMPLE — owner maintenance block',
  }))
  const { error } = await service.from('listing_blackout_dates').upsert(rows, { onConflict: 'listing_id,blackout_date' })
  if (error) throw new Error(`listing_blackout_dates: ${error.message}`)
  console.log('✓ Two sample blackout dates blocked on the audio kit')
}

async function seedVerifications(service, ids) {
  for (const [key, fixtures] of Object.entries(VERIFICATION_FIXTURES)) {
    const userId = ids[key]
    const rows = fixtures.map((fixture) => ({
      id: fixture.id,
      user_id: userId,
      doc_type: fixture.doc_type,
      file_path: `${userId}/${fixture.file}`,
      status: 'approved',
      review_note: 'Synthetic sample accepted for demonstration.',
      reviewed_by: ids.admin,
      reviewed_at: daysAgo(2),
      created_at: daysAgo(fixture.ageDays),
    }))
    const { error } = await service.from('verification_submissions').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`verification_submissions (${key}): ${error.message}`)

    for (const fixture of fixtures) {
      const { data: event } = await service.from('verification_events')
        .select('id').eq('submission_id', fixture.id).eq('event_type', 'approved').maybeSingle()
      if (event) continue
      const { error: eventError } = await service.from('verification_events').insert({
        user_id: userId,
        submission_id: fixture.id,
        event_type: 'approved',
        actor_id: ids.admin,
        doc_type: fixture.doc_type,
        reason: 'Synthetic sample approval.',
        metadata: { sample: true, warning: 'NOT A REAL ID' },
      })
      if (eventError) throw new Error(`verification_events (${fixture.doc_type}): ${eventError.message}`)
    }

    const { error: recomputeError } = await service.rpc('recompute_verification_aggregate', { target_user_id: userId })
    if (recomputeError) throw new Error(`recompute_verification_aggregate (${key}): ${recomputeError.message}`)
  }
  console.log('✓ Approvals recorded: identity + student for Julian Valdez, identity for Andrea Lim')
}

async function seedLegacyBookings(service, ids) {
  const rates = Object.fromEntries(LISTING_FIXTURES.map((fixture) => [fixture.key, fixture.daily_rate]))
  const rows = V1_BOOKINGS.map((fixture) => {
    const start = manilaDate(fixture.start)
    const end = manilaDate(fixture.end)
    const days = daysBetween(start, end)
    const subtotal = rates[fixture.listing] * days
    return {
      id: fixture.id,
      listing_id: LISTINGS[fixture.listing],
      renter_id: ids.renter,
      owner_id: ids.owner,
      start_date: start,
      end_date: end,
      days,
      daily_rate_snapshot: rates[fixture.listing],
      subtotal,
      discount_amount: 0,
      total: subtotal,
      shoot_description: fixture.description,
      workflow_version: 1,
    }
  })
  const { error } = await service.from('bookings').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`bookings (v1): ${error.message}`)

  // Advance status forward only — never rewind completed or payout history.
  for (const fixture of V1_BOOKINGS) {
    const { data: current, error: readError } = await service.from('bookings').select('status').eq('id', fixture.id).single()
    if (readError) throw readError
    const currentStatus = current?.status ?? 'pending'
    if (fixture.target === 'declined') {
      if (currentStatus === 'pending') {
        const { error: updateError } = await service.from('bookings').update({ status: 'declined' }).eq('id', fixture.id)
        if (updateError) throw updateError
      }
      continue
    }
    let rank = V1_ORDER.indexOf(currentStatus)
    const targetRank = V1_ORDER.indexOf(fixture.target)
    while (rank >= 0 && rank < targetRank) {
      rank += 1
      const { error: updateError } = await service.from('bookings').update({ status: V1_ORDER[rank] }).eq('id', fixture.id)
      if (updateError) throw updateError
    }
  }
  console.log('✓ Six legacy bookings covering pending, approved, active, returned, completed, declined')
}

async function seedHandoffs(service, ids) {
  const rows = V1_HANDOFFS.map((fixture) => ({
    booking_id: fixture.booking,
    user_id: fixture.party === 'owner' ? ids.owner : ids.renter,
    party: fixture.party,
    stage: fixture.stage,
    checklist: fixture.checklist,
  }))
  const { error } = await service.from('booking_handoffs').upsert(rows, { onConflict: 'booking_id,party,stage', ignoreDuplicates: true })
  if (error) throw new Error(`booking_handoffs: ${error.message}`)
  console.log('✓ Sample handoff checklists added')
}

async function seedMessages(service, ids) {
  const rows = MESSAGES.map((fixture) => ({
    id: fixture.id,
    booking_id: fixture.booking,
    sender_id: ids[fixture.sender],
    body: fixture.body,
    attachments: [],
    read_at: fixture.readAfterDays == null ? null : new Date(Date.now() - fixture.readAfterDays * 86400000).toISOString(),
    created_at: daysAgo(fixture.ageDays),
  }))
  const { error } = await service.from('messages').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`messages: ${error.message}`)
  console.log('✓ Sample message threads added (one unread per side for the badge)')
}

async function seedReviews(service, ids) {
  const rows = REVIEWS.map((fixture) => ({
    id: fixture.id,
    booking_id: fixture.booking,
    listing_id: LISTINGS[fixture.listing],
    reviewer_id: ids[fixture.reviewer],
    reviewee_id: ids[fixture.reviewee],
    rating: fixture.rating,
    comment: fixture.comment,
    created_at: daysAgo(15),
  }))
  const { error } = await service.from('reviews').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`reviews: ${error.message}`)
  console.log('✓ Sample reviews exchanged between owner and renter')
}

// ------------------------------------------------------------------
// Workflow-v2 drivers — every write goes through the real RPCs with
// signed-in sessions, so all gates (operator assignment, agreement
// signatures, deposit state, inspections, custody) are exercised.
// ------------------------------------------------------------------

async function getBooking(admin, bookingId) {
  const { data, error } = await admin.supabase.from('bookings').select('id, status').eq('id', bookingId).single()
  if (error) throw error
  return data
}

async function getOperation(admin, bookingId) {
  const { data, error } = await admin.supabase.from('booking_operations').select('operator_id, custody_state, issue_hold').eq('booking_id', bookingId).single()
  if (error) throw error
  return data
}

async function getDeposit(admin, bookingId) {
  const { data, error } = await admin.supabase.from('booking_deposits').select('*').eq('booking_id', bookingId).single()
  if (error) throw error
  return data
}

async function getRentalPayment(admin, bookingId) {
  const { data, error } = await admin.supabase.from('booking_rental_payments').select('*').eq('booking_id', bookingId).single()
  if (error) throw new Error(`Rental payment: ${error.message}. Apply supabase/rental-payments.sql before running sample:data.`)
  return data
}

async function existingSampleBooking(renter, description) {
  const { data, error } = await renter.supabase
    .from('bookings')
    .select('*')
    .eq('renter_id', renter.user.id)
    .eq('shoot_description', description)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function createV2Booking(renter, listingId, startOffset, endOffset, description) {
  const existing = await existingSampleBooking(renter, description)
  if (existing) return existing
  const { data: listing, error: listingError } = await renter.supabase.from('gear_listings').select('daily_rate').eq('id', listingId).single()
  if (listingError) throw listingError
  const { data, error } = await renter.supabase.rpc('create_booking', {
    p_listing_id: listingId,
    p_start_date: manilaDate(startOffset),
    p_end_date: manilaDate(endOffset),
    p_shoot_description: description,
    p_expected_daily_rate: Number(listing.daily_rate),
  }).single()
  if (error) throw error
  return data
}

async function assignAndApprove(booking, owner, admin) {
  const operation = await getOperation(admin, booking.id)
  if (!operation.operator_id) {
    const { error } = await admin.supabase.rpc('assign_booking_operator', { p_booking_id: booking.id, p_operator_id: admin.user.id })
    if (error) throw error
  }
  const current = await getBooking(admin, booking.id)
  if (current.status === 'pending') {
    const { error } = await owner.supabase.rpc('decide_rental_request', { p_booking_id: booking.id, p_decision: 'approve' })
    if (error) throw error
    booking.status = 'approved'
  }
}

async function acceptAgreement(supabase, bookingId) {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Sample agreement signing requires an authenticated participant.')

  const { data: agreement, error: agreementError } = await supabase
    .from('booking_agreements')
    .select('id, terms_hash')
    .eq('booking_id', bookingId)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  if (agreementError) throw agreementError

  const { data: existing, error: existingError } = await supabase
    .from('booking_agreement_acceptances')
    .select('id')
    .eq('agreement_id', agreement.id)
    .eq('user_id', authData.user.id)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return

  const signature = samplePng('SAMPLE SIGNATURE', `SIGNED BY ${authData.user.email?.split('@')[0]?.toUpperCase() || 'PARTICIPANT'}`)
  const signatureSha256 = createHash('sha256').update(signature).digest('hex')
  const signaturePath = `${authData.user.id}/${bookingId}/${agreement.id}/5a160001-0000-4000-8000-000000000001.png`
  if (!(await objectExists(supabase, 'agreement-signatures', signaturePath))) {
    const { error: uploadError } = await supabase.storage.from('agreement-signatures').upload(signaturePath, signature, {
      contentType: 'image/png',
      cacheControl: '3600',
      metadata: { sha256: signatureSha256 },
    })
    if (uploadError && !/exist|duplicate/i.test(uploadError.message ?? '')) throw uploadError
  }

  const { error } = await supabase.rpc('accept_booking_agreement', {
    p_booking_id: bookingId,
    p_agreement_id: agreement.id,
    p_terms_hash: agreement.terms_hash,
    p_signature_object_path: signaturePath,
    p_signature_sha256: signatureSha256,
    p_signature_capture_method: 'drawn',
    p_signature_mime_type: 'image/png',
    p_signature_byte_size: signature.length,
  })
  if (error) throw error
}

async function confirmTransfer(supabase, bookingId, kind, note) {
  const { error } = await supabase.rpc('confirm_hub_transfer', { p_booking_id: bookingId, p_transfer_kind: kind, p_condition_note: note })
  if (error) throw error
}

// Deposit: proof upload -> submit -> admin review, whichever steps are still
// missing. Waived deposits are returned untouched.
async function ensureDepositHeld(renter, admin, bookingId, referenceLabel) {
  let deposit = await getDeposit(admin, bookingId)
  if (['held', 'waived_student', 'refunded', 'forfeited'].includes(deposit.status)) return deposit
  if (['awaiting_payment', 'rejected'].includes(deposit.status)) {
    const path = `${renter.user.id}/${bookingId}/sample-deposit-proof.png`
    await uploadSample(renter.supabase, 'deposit-proofs', path, 'GCASH DEPOSIT', 'SAMPLE PROOF - PHP 2000')
    const { error } = await renter.supabase.rpc('submit_booking_deposit_proof', {
      p_booking_id: bookingId,
      p_gcash_reference: `SAMPLE-DEP-${bookingId.slice(0, 8)}${referenceLabel ? `-${referenceLabel}` : ''}`,
      p_proof_path: path,
    })
    if (error) throw error
    deposit = await getDeposit(admin, bookingId)
  }
  if (deposit.status === 'pending_review') {
    const { error } = await admin.supabase.rpc('review_booking_deposit', {
      p_booking_id: bookingId,
      p_decision: 'approve',
      p_review_note: 'SAMPLE — synthetic GCash proof approved for demonstration.',
    })
    if (error) throw error
    deposit = await getDeposit(admin, bookingId)
  }
  return deposit
}

async function ensureRentalPaymentAccepted(renter, admin, bookingId, referenceLabel) {
  let payment = await getRentalPayment(admin, bookingId)
  if (payment.status === 'proof_accepted' || (payment.status === 'not_required' && payment.not_required_reason === 'zero_total')) return payment
  if (payment.status === 'not_required') throw new Error('A historical rental-payment exemption cannot authorize a new sample pickup.')
  if (['awaiting_payment', 'rejected'].includes(payment.status)) {
    const path = `${renter.user.id}/${bookingId}/sample-rental-payment-proof${payment.status === 'rejected' ? `-${Date.now()}` : ''}.png`
    await uploadSample(renter.supabase, 'rental-payment-proofs', path, 'RENTAL PAYMENT', `SAMPLE PROOF - PHP ${Number(payment.amount)}`)
    const { error } = await renter.supabase.rpc('submit_booking_rental_payment_proof', {
      p_booking_id: bookingId,
      p_gcash_reference: `SAMPLE-RENT-${bookingId.slice(0, 8)}-${referenceLabel}`,
      p_proof_path: path,
    })
    if (error) throw error
    payment = await getRentalPayment(admin, bookingId)
  }
  if (payment.status === 'pending_review') {
    const { error } = await admin.supabase.rpc('review_booking_rental_payment', {
      p_booking_id: bookingId,
      p_decision: 'approve',
      p_review_note: 'SAMPLE — synthetic rental-payment receipt accepted for demonstration. No real payment.',
      p_expected_proof_path: payment.proof_path,
    })
    if (error) throw error
    payment = await getRentalPayment(admin, bookingId)
  }
  return payment
}

const INSPECTION_SUMMARIES = {
  pre_release: 'SAMPLE — body, controls, mounts, and accessories checked in good condition.',
  post_return: 'SAMPLE — returned unit checked; all accessories present and working.',
}

async function ensureInspection(admin, owner, renter, bookingId, kind) {
  let { data: inspection, error } = await admin.supabase
    .from('booking_inspections')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('inspection_kind', kind)
    .maybeSingle()
  if (error) throw error
  if (!inspection) {
    const { data, error: saveError } = await admin.supabase.rpc('save_booking_inspection', {
      p_booking_id: bookingId,
      p_inspection_kind: kind,
      p_condition_summary: INSPECTION_SUMMARIES[kind],
      p_meter_reading: 'SAMPLE-SERIAL-CHECKED',
      p_notes: '{"body":true,"controls":true,"accessories":true,"sample":true}',
      p_photo_paths: [],
    }).single()
    if (saveError) throw saveError
    inspection = data
  }
  if (inspection.status !== 'finalized') {
    const path = `${bookingId}/${inspection.id}/sample-${kind}.png`
    await uploadSample(admin.supabase, 'inspection-photos', path, kind === 'pre_release' ? 'PRE-RELEASE' : 'POST-RETURN', 'SAMPLE INSPECTION PHOTO')
    const { error: saveError } = await admin.supabase.rpc('save_booking_inspection', {
      p_booking_id: bookingId,
      p_inspection_kind: kind,
      p_condition_summary: INSPECTION_SUMMARIES[kind],
      p_meter_reading: 'SAMPLE-SERIAL-CHECKED',
      p_notes: '{"body":true,"controls":true,"accessories":true,"sample":true}',
      p_photo_paths: [path],
    })
    if (saveError) throw saveError
    const { error: finalError } = await admin.supabase.rpc('finalize_booking_inspection', { p_inspection_id: inspection.id })
    if (finalError) throw finalError
  }
  for (const participant of [owner, renter]) {
    const { error: confirmError } = await participant.supabase.rpc('confirm_booking_inspection', { p_booking_id: bookingId, p_inspection_kind: kind })
    if (confirmError) throw confirmError
  }
}

// Advance a workflow-v2 booking to `through`: 'approved' | 'active' |
// 'completed'. Every step checks current state first, so reruns are no-ops
// and interrupted runs resume from where they stopped.
async function advanceV2(booking, owner, renter, admin, { through, depositLabel }) {
  await assignAndApprove(booking, owner, admin)
  let status = (await getBooking(admin, booking.id)).status

  if (through !== 'approved' && status === 'approved') {
    await acceptAgreement(owner.supabase, booking.id)
    await acceptAgreement(renter.supabase, booking.id)
    await ensureRentalPaymentAccepted(renter, admin, booking.id, depositLabel)
    await ensureDepositHeld(renter, admin, booking.id, depositLabel)

    let custody = (await getOperation(admin, booking.id)).custody_state
    if (custody === 'owner') {
      await confirmTransfer(owner.supabase, booking.id, 'owner_to_hub', 'SAMPLE — owner delivered the item to the hub.')
      await confirmTransfer(admin.supabase, booking.id, 'owner_to_hub', 'SAMPLE — operator received the item.')
    }
    await ensureInspection(admin, owner, renter, booking.id, 'pre_release')

    custody = (await getOperation(admin, booking.id)).custody_state
    if (custody === 'hub') {
      await confirmTransfer(admin.supabase, booking.id, 'hub_to_renter', 'SAMPLE — operator released the item.')
      await confirmTransfer(renter.supabase, booking.id, 'hub_to_renter', 'SAMPLE — renter received the item.')
    }
    status = (await getBooking(admin, booking.id)).status
  }

  if (through === 'completed' && status === 'active') {
    const custody = (await getOperation(admin, booking.id)).custody_state
    if (custody === 'renter') {
      await confirmTransfer(renter.supabase, booking.id, 'renter_to_hub', 'SAMPLE — renter returned the item to the hub.')
      await confirmTransfer(admin.supabase, booking.id, 'renter_to_hub', 'SAMPLE — operator received the returned item.')
    }
    status = (await getBooking(admin, booking.id)).status
  }

  if (through === 'completed' && status === 'returned') {
    await ensureInspection(admin, owner, renter, booking.id, 'post_return')
    let custody = (await getOperation(admin, booking.id)).custody_state
    if (custody === 'hub_return') {
      await confirmTransfer(admin.supabase, booking.id, 'hub_to_owner', 'SAMPLE — operator handed the item back to the owner.')
      await confirmTransfer(owner.supabase, booking.id, 'hub_to_owner', 'SAMPLE — owner collected the item.')
    }
    status = (await getBooking(admin, booking.id)).status
    if (status === 'returned') {
      // The v2 completion gate requires the deposit already refunded or
      // forfeited, so resolve it before completing the booking.
      let deposit = await getDeposit(admin, booking.id)
      if (deposit.status === 'held') {
        const { error } = await admin.supabase.rpc('review_booking_deposit', {
          p_booking_id: booking.id,
          p_decision: 'refund',
          p_review_note: 'SAMPLE — equipment returned in good condition.',
        })
        if (error) throw error
        deposit = await getDeposit(admin, booking.id)
      }
      if (deposit.status === 'refund_pending') {
        const { error } = await admin.supabase.rpc('review_booking_deposit', {
          p_booking_id: booking.id,
          p_decision: 'confirm_refund',
          p_review_note: 'SAMPLE-GCASH-REFUND-0001',
        })
        if (error) throw error
        deposit = await getDeposit(admin, booking.id)
      }
      if (!['refunded', 'forfeited', 'waived_student'].includes(deposit.status)) {
        throw new Error(`Booking ${booking.id}: deposit is ${deposit.status}; completion requires refunded or forfeited.`)
      }
      const { error } = await admin.supabase.rpc('complete_hub_booking', { p_booking_id: booking.id })
      if (error) throw error
      status = 'completed'
    }
  }

  if (through === 'completed' && status === 'completed') {
    // The payout row is auto-created by the completion trigger.
    const { data: payout, error: payoutError } = await owner.supabase.from('payouts').select('*').eq('booking_id', booking.id).maybeSingle()
    if (payoutError) throw payoutError
    if (payout && payout.status === 'pending') {
      const { error } = await owner.supabase.from('payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payout.id)
      if (error) throw error
    }
  }
  return status
}

async function ensurePromoPass(renter, admin) {
  const { data: current, error: currentError } = await renter.supabase
    .from('promo_passes')
    .select('*')
    .eq('renter_id', renter.user.id)
    .in('status', ['pending_review', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (currentError) throw currentError

  // Repair a run interrupted between payment submission and admin approval.
  if (current?.status === 'pending_review') {
    const { data: approved, error } = await admin.supabase
      .rpc('review_promo_pass', { p_pass_id: current.id, p_decision: 'approved', p_review_note: 'Synthetic sample payment approved for demonstration.' })
      .single()
    if (error) throw error
    console.log('✓ Repaired and approved a pending sample Saver Pass')
    return approved
  }
  if (current?.status === 'active') return current

  const proofPath = `${renter.user.id}/sample-saver-pass-proof.png`
  await uploadSample(renter.supabase, 'promo-payment-proofs', proofPath, 'GCASH PROOF', 'SAMPLE PAYMENT - PHP 99')
  const reference = `SAMPLE-PASS-${renter.user.id.slice(0, 8)}`
  const { data: submitted, error: submitError } = await renter.supabase
    .rpc('submit_promo_pass_payment', { p_gcash_reference: reference, p_proof_path: proofPath })
    .single()
  if (submitError) throw submitError
  const { data: approved, error: reviewError } = await admin.supabase
    .rpc('review_promo_pass', { p_pass_id: submitted.id, p_decision: 'approved', p_review_note: 'Synthetic sample payment approved for demonstration.' })
    .single()
  if (reviewError) throw reviewError
  console.log('✓ Created an active sample Saver Pass')
  return approved
}

async function uploadVerificationSamples(renter, renter2, fixtures) {
  for (const [session, docs] of [[renter, fixtures.renter], [renter2, fixtures.renter2]]) {
    for (const fixture of docs) {
      const title = fixture.doc_type === 'government_id' ? 'GOVERNMENT ID'
        : fixture.doc_type === 'selfie' ? 'SELFIE CHECK'
        : fixture.doc_type === 'student_id' ? 'STUDENT ID'
        : 'ENROLLMENT PROOF'
      await uploadSample(session.supabase, 'verification-docs', `${session.user.id}/${fixture.file}`, title, 'SYNTHETIC SAMPLE DOCUMENT')
    }
  }
  console.log('✓ Uploaded six watermarked synthetic verification documents')
}

// Incident filed by the renter through the real RPC (which auto-places the
// issue hold on workflow-v2 bookings). `open` leaves it under review in the
// admin queue; otherwise the admin resolves it with a note.
async function ensureIncident(renter, admin, bookingId, { category, description, incidentDay, open, resolutionNote }) {
  const { data: existing, error: readError } = await admin.supabase
    .from('incidents')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (readError) throw readError

  let incident = existing
  if (!incident) {
    const path = `${bookingId}/sample-incident-${category}.png`
    await uploadSample(renter.supabase, 'incident-photos', path, 'INCIDENT PHOTO', 'SAMPLE EVIDENCE IMAGE')
    const { data, error } = await renter.supabase.rpc('create_incident', {
      p_booking_id: bookingId,
      p_category: category,
      p_description: description,
      p_incident_date: manilaDate(incidentDay),
      p_photo_paths: [path],
    }).single()
    if (error) throw error
    incident = data
  }

  if (open) {
    if (incident.status === 'submitted') {
      const { error } = await admin.supabase.rpc('update_incident_status', { p_incident_id: incident.id, p_status: 'under_review' })
      if (error) throw error
    }
    return
  }

  if (incident.status === 'submitted') {
    const { error } = await admin.supabase.rpc('update_incident_status', { p_incident_id: incident.id, p_status: 'under_review' })
    if (error) throw error
  }
  const { data: current, error: currentError } = await admin.supabase.from('incidents').select('status').eq('id', incident.id).single()
  if (currentError) throw currentError
  if (current.status === 'under_review') {
    const { error } = await admin.supabase.rpc('update_incident_status', {
      p_incident_id: incident.id,
      p_status: 'resolved',
      p_resolution_note: resolutionNote,
    })
    if (error) throw error
  }
}

async function ensureForfeitedDeposit(admin, bookingId) {
  const deposit = await getDeposit(admin, bookingId)
  if (deposit.status === 'forfeited') return
  if (deposit.status !== 'held') {
    throw new Error(`Booking ${bookingId}: expected a held deposit to forfeit, found ${deposit.status}.`)
  }
  const { error } = await admin.supabase.rpc('review_booking_deposit', {
    p_booking_id: bookingId,
    p_decision: 'forfeit',
    p_review_note: 'SAMPLE — forfeiture for the reported damage incident.',
    p_amount: Number(deposit.amount),
  })
  if (error) throw error
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  const env = readEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !publishableKey) throw new Error('.env is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  if (!serviceKey) {
    throw new Error(
      '.env is missing SUPABASE_SERVICE_ROLE_KEY. Add it from Supabase Dashboard -> Settings -> API -> service_role '
      + '(project settings, server-side only — never commit it or use it in app code).'
    )
  }

  const service = client(url, serviceKey)

  console.log('— Phase A: sample users and base rows (service role) —')
  const ids = await ensureUsers(service)
  await seedProfiles(service, ids)
  await seedHub(service)
  await seedListings(service, ids.owner)
  await seedAssets(service)
  await seedBlackouts(service, ids.owner)
  await seedVerifications(service, ids)
  await seedLegacyBookings(service, ids)
  await seedHandoffs(service, ids)
  await seedMessages(service, ids)
  await seedReviews(service, ids)

  console.log('\n— Phase B/C: signed-in RPC flows (owner / renter / renter2 / admin) —')
  const passwords = {}
  const [owner, renter, renter2, admin] = await Promise.all([
    login(url, publishableKey, 'owner', passwords),
    login(url, publishableKey, 'renter', passwords),
    login(url, publishableKey, 'renter2', passwords),
    login(url, publishableKey, 'admin', passwords),
  ])

  await uploadVerificationSamples(renter, renter2, VERIFICATION_FIXTURES)
  await ensurePromoPass(renter, admin)

  console.log('\nJulian Valdez (student renter) workflow-v2 scenarios:')
  for (const [label, scenario] of Object.entries(V2_RENTER)) {
    const booking = await createV2Booking(renter, LISTINGS[scenario.listing], scenario.start, scenario.end, scenario.description)
    await advanceV2(booking, owner, renter, admin, { through: scenario.through, depositLabel: label })
    console.log(`✓ ${scenario.description}`)
  }

  console.log('\nAndrea Lim (non-student renter) deposit / payout / incident scenarios:')
  for (const [label, scenario] of Object.entries(V2_RENTER2)) {
    const booking = await createV2Booking(renter2, LISTINGS[scenario.listing], scenario.start, scenario.end, scenario.description)
    await advanceV2(booking, owner, renter2, admin, { through: scenario.through, depositLabel: label })
    // The deposit-review scenario holds the deposit while the booking itself
    // stays approved (awaiting hub handoff).
    if (scenario.deposit === 'held') await ensureDepositHeld(renter2, admin, booking.id, label)
    console.log(`✓ ${scenario.description}`)
  }

  // Open damage incident with a forfeited deposit on Andrea's active booking.
  const forfeitBooking = await existingSampleBooking(renter2, V2_RENTER2.forfeit.description)
  await ensureIncident(renter2, admin, forfeitBooking.id, {
    category: 'damage',
    description: 'SAMPLE — renter reported a scratched lens barrel during the shoot.',
    incidentDay: 0,
    open: true,
  })
  await ensureForfeitedDeposit(admin, forfeitBooking.id)
  console.log('✓ Open damage incident (under review) with a forfeited deposit')

  // Resolved accessory-missing incident on the completed legacy booking.
  const completedV1 = V1_BOOKINGS.find((fixture) => fixture.target === 'completed')
  await ensureIncident(renter, admin, completedV1.id, {
    category: 'accessory_missing',
    description: 'SAMPLE — one windscreen missing after the completed event production.',
    incidentDay: -4,
    open: false,
    resolutionNote: 'SAMPLE — accessory recovered during hub restock; parties notified.',
  })
  console.log('✓ Resolved accessory-missing incident on the completed booking')

  const digest = createHash('sha256').update(`${ids.owner}:${ids.renter}:${ids.renter2}:${ids.admin}`).digest('hex').slice(0, 12)
  console.log('\nSample data is ready.')
  console.log(`Dataset marker: ${digest}`)
  for (const account of Object.values(ACCOUNTS)) {
    console.log(`${account.name}: ${account.email} (${account.role})`)
  }
  console.log('All generated verification, payment, and inspection images say SAMPLE / NOT A REAL ID.')
}

main().catch((error) => {
  console.error(`\nSample data setup failed: ${error.message}`)
  process.exit(1)
})
