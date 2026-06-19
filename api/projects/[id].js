const supabase = require('../_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = parseInt(req.query.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: `Project ${id} not found` });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const allowed = ['project','category','status','priority','rag','owner','spoc',
                     'tech','blocker','eta','mc','mc_reason','current_status'];
    const updates = {};
    const body = req.body || {};
    allowed.forEach(k => { if (k in body) updates[k] = body[k]; });
    if (!Object.keys(updates).length)
      return res.status(400).json({ error: 'No valid fields to update' });
    const { data, error } = await supabase
      .from('projects').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: 'Project updated', data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: `Project ${id} deleted` });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
