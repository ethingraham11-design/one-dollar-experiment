export default async () => {
 const url = Netlify.env.get("SUPABASE_URL");
const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error: 'Counter is not configured' }, { status: 503 });
  const response = await fetch(`${url}/rest/v1/sales?select=id`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' } });
  if (!response.ok) return Response.json({ error: 'Could not load counter' }, { status: 502 });
  const count = Number((response.headers.get('content-range') || '*/0').split('/')[1] || 0);
  return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
};
