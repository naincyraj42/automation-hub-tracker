import supabase from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /api/projects ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { category, status, rag, priority, mc, q } = req.query;
    let query = supabase.from('projects').select('*').order('project');

    if (category) query = query.eq('category', category);
    if (status)   query = query.eq('status', status);
    if (rag)      query = query.eq('rag', rag);
    if (priority) query = query.eq('priority', priority);
    if (mc)       query = query.eq('mc', mc);
    if (q)        query = query.or(
      `project.ilike.%${q}%,owner.ilike.%${q}%,tech.ilike.%${q}%`
    );

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ count: data.length, data });
  }

  // ── POST /api/projects ────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;
    if (!body.project || !body.category || !body.status) {
      return res.status(400).json({ error: 'project, category and status are required' });
    }
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        project:       body.project,
        category:      body.category,
        status:        body.status,
        priority:      body.priority      || '',
        rag:           body.rag           || 'G',
        owner:         body.owner         || '',
        spoc:          body.spoc          || '',
        tech:          body.tech          || '',
        blocker:       body.blocker       || '',
        eta:           body.eta           || '',
        mc:            body.mc            || 'No',
        mc_reason:     body.mc_reason     || '',
        current_status:body.current_status|| '',
      }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ message: 'Project created', data });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
