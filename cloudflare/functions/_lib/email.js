// Sends transactional email from Cloudflare Pages via an email HTTP API.
// Cloudflare cannot open raw SMTP connections, so delivery relies on a provider:
//   - Resend (recommended): set RESEND_API_KEY
//   - Mailgun (fallback):   set MAILGUN_API_KEY + MAILGUN_DOMAIN
// Returns { ok, provider } or { ok:false, provider:null, reason } when no
// provider is configured (the submission is still persisted to D1).

function configured(env, key) {
  return String((env && env[key]) || '').trim();
}

async function sendEmail(env, { to, subject, text }) {
  const resendKey = configured(env, 'RESEND_API_KEY');
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: String(env.EMAIL_FROM || 'AI 潮汐 <onboarding@resend.dev>'),
        to,
        subject,
        text,
      }),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, provider: 'resend' };
    let detail = '';
    try {
      detail = await res.text();
    } catch {}
    return { ok: false, provider: 'resend', reason: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  }

  const mailgunKey = configured(env, 'MAILGUN_API_KEY');
  const mailgunDomain = configured(env, 'MAILGUN_DOMAIN');
  if (mailgunKey && mailgunDomain) {
    const params = new URLSearchParams();
    params.set('from', String(env.EMAIL_FROM || `AI 潮汐 <no-reply@${mailgunDomain}>`));
    params.set('to', to);
    params.set('subject', subject);
    params.set('text', text);
    const res = await fetch(
      `https://api.mailgun.net/v3/${encodeURIComponent(mailgunDomain)}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
        },
        body: params,
      }
    );
    if (res.status >= 200 && res.status < 300) return { ok: true, provider: 'mailgun' };
    let detail = '';
    try {
      detail = await res.text();
    } catch {}
    return { ok: false, provider: 'mailgun', reason: `HTTP ${res.status}: ${detail.slice(0, 200)}` };
  }

  return { ok: false, provider: null, reason: '未配置邮件服务，提交已保存到后台' };
}

module.exports = { sendEmail, configured };
