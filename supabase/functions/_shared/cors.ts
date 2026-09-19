const fixedOrigins = new Set([
  'https://ckefamedia.com',
  'https://www.ckefamedia.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? ''
  const configuredOrigin = Deno.env.get('SITE_URL')?.replace(/\/$/, '')
  const allowed = fixedOrigins.has(origin) || origin === configuredOrigin
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://ckefamedia.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}
