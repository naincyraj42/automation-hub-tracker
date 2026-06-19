import supabase from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let db = 'ok';
  try {
    const { error } = await supabase.from('projects').select('id').limit(1);
    if (error) db = 'error: ' + error.message;
  } catch (e) {
    db = 'unreachable';
  }

  return res.status(200).json({
    status: db === 'ok' ? 'ok' : 'degraded',
    service: 'enterprise/project_tracker',
    database: db,
    version: '2.0.0',
    platform: 'Vercel + Supabase',
    timestamp: new Date().toISOString(),
  });
}
