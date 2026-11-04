// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: drains notification_queue and sends via Resend.
// Allowed callers: service role key, or a signed-in admin user JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API = 'https://api.resend.com/emails';
const FROM = Deno.env.get('EMAIL_FROM') ?? 'LensShare <onboarding@resend.dev>';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Allowed callers: the service role itself, or a signed-in admin.
  let admin = false;
  if (serviceKey && auth === `Bearer ${serviceKey}`) {
    admin = true;
  } else {
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const { data: profile } = await userClient
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();
      admin = profile?.role === 'admin';
    }
  }
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return Response.json({ error: 'RESEND_API_KEY secret not set' }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey);

  const { data: queued, error: fetchError } = await supabase
    .from('notification_queue')
    .select('id, to_email, subject, lines')
    .order('created_at', { ascending: true })
    .limit(25);
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  if (!queued?.length) return Response.json({ sent: 0 });

  let sent = 0;
  const failures: any[] = [];
  for (const row of queued) {
    const lines: string[] = row.lines ?? [];
    try {
      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [row.to_email],
          subject: row.subject,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px">
            <p style="font-family:Georgia,serif;font-size:20px;color:#07100e">${escapeHtml(row.subject)}</p>
            ${lines.map((line) => `<p style="font-size:14px;color:#333">${escapeHtml(String(line))}</p>`).join('')}
            <p style="font-size:11px;color:#999;margin-top:24px">LensShare · Naga City camera gear co-op</p>
          </div>`,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      sent += 1;
      await supabase.from('notification_queue').delete().eq('id', row.id);
    } catch (err) {
      failures.push({ id: row.id, error: String(err) });
    }
  }

  return Response.json({ sent, failures });
});
