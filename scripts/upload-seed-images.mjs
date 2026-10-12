#!/usr/bin/env node
// One-shot migration: move gear photos referenced as local /public paths
// onto the Supabase `gear-photos` bucket and point the listings at the
// public storage URLs.
//
// Usage (from the repo root):
//   node scripts/upload-seed-images.mjs
// or non-interactive:
//   LENSSHARE_EMAIL=you@example.com LENSSHARE_PASSWORD=... node scripts/upload-seed-images.mjs
//
// Safe to re-run: only listings whose image_url starts with "/" are touched.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { createInterface } from 'node:readline'

const root = process.cwd()
const envPath = join(root, '.env')

function readEnv() {
  if (!existsSync(envPath)) throw new Error(`No .env found at ${envPath}`)
  const text = readFileSync(envPath, 'utf8')
  const vars = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return vars
}

function ask(question, { mask = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (!mask) {
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) })
      return
    }
    let muted = false
    rl._writeToOutput = function (chunk) {
      if (muted) return
      rl.output.write(chunk)
    }
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer.trim()) })
    muted = true
  })
}

const contentTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

async function main() {
  const env = readEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('.env is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

  const email = process.env.LENSSHARE_EMAIL || await ask('Owner email: ')
  const password = process.env.LENSSHARE_PASSWORD || await ask('Password: ', { mask: true })

  const supabase = createClient(url, key)
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) throw new Error(`Login failed: ${authError.message}`)
  const userId = auth.user.id
  console.log(`Signed in as ${email} (${userId})`)

  const { data: owned, error: listError } = await supabase
    .from('gear_listings')
    .select('id, name, image_url')
    .eq('owner_id', userId)
  if (listError) throw listError
  if (!owned.length) {
    console.log('This account owns no gear listings at all.')
    console.log('Run supabase/seed.sql first (or add gear in the dashboard), then run this script again.')
    return
  }
  const listings = owned.filter((listing) => listing.image_url?.startsWith('/'))
  if (!listings.length) {
    console.log(`All ${owned.length} listing(s) owned by this account already use remote image URLs — nothing to do.`)
    return
  }
  console.log(`${listings.length} of ${owned.length} listing(s) still use local /public images:`)

  const urlByLocalPath = new Map()
  let moved = 0

  for (const listing of listings) {
    const localPath = listing.image_url
    let publicUrl = urlByLocalPath.get(localPath)

    if (!publicUrl) {
      const filePath = join(root, 'public', localPath.replace(/^\//, ''))
      if (!existsSync(filePath)) {
        console.warn(`  ! ${listing.name}: ${localPath} has no matching file in public/ — skipped`)
        continue
      }
      const ext = extname(filePath).toLowerCase()
      const storagePath = `${userId}/seed/${basename(filePath)}`
      const { error: uploadError } = await supabase.storage
        .from('gear-photos')
        .upload(storagePath, readFileSync(filePath), { upsert: true, contentType: contentTypes[ext] || 'application/octet-stream' })
      if (uploadError) {
        console.warn(`  ! ${listing.name}: upload failed — ${uploadError.message}`)
        continue
      }
      publicUrl = supabase.storage.from('gear-photos').getPublicUrl(storagePath).data.publicUrl
      urlByLocalPath.set(localPath, publicUrl)
    }

    const { error: updateError } = await supabase
      .from('gear_listings')
      .update({ image_url: publicUrl })
      .eq('id', listing.id)
      .eq('owner_id', userId)
    if (updateError) {
      console.warn(`  ! ${listing.name}: update failed — ${updateError.message}`)
      continue
    }
    console.log(`  ✓ ${listing.name}: ${localPath} → ${publicUrl}`)
    moved += 1
  }

  console.log(`\nDone: ${moved}/${listings.length} listing(s) now use Supabase Storage images.`)
  console.log('Reload /browse to see them served from the gear-photos bucket.')
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`)
  process.exit(1)
})
