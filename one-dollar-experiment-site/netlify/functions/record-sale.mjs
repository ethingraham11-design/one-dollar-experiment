export default async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const secret = process.env.ADMIN_SECRET;
  if (!secret || request.headers.get('x-admin-secret') !== secret) return Response.json({ error: 'Incorrect admin secret' }, { status: 401 });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: 'Database is not configured' }, { status: 503 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  const transactionId = String(body.transaction_id || '').trim();
  if (!transactionId || transactionId.length > 160) return Response.json({ error: 'Enter a valid PayPal transaction ID' }, { status: 400 });
  const response = await fetch(`${url}/rest/v1/sales`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ transaction_id: transactionId, amount: '1.00', currency: 'USD' }) });
  if (response.status === 409) return Response.json({ duplicate: true });
  if (!response.ok) return Response.json({ error: 'Could not save sale. Check database setup and transaction ID.' }, { status: 502 });
  return Response.json({ added: true });
};
