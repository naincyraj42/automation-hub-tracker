const supabase = require('../_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data, error } = await supabase.from('projects').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const total = data.length;
  const by_status = {}, by_category = {};
  const rag = { G: 0, A: 0, R: 0 };
  const maker_checker = { Yes: 0, Partial: 0, No: 0 };

  data.forEach(d => {
    by_status[d.status]     = (by_status[d.status]     || 0) + 1;
    by_category[d.category] = (by_category[d.category] || 0) + 1;
    if (d.rag in rag)           rag[d.rag]++;
    if (d.mc  in maker_checker) maker_checker[d.mc]++;
  });

  return res.status(200).json({
    total, rag, maker_checker, by_status, by_category,
    live:        by_status['Live']        || 0,
    blocked:     by_status['Blocked']     || 0,
    in_progress: by_status['In Progress'] || 0,
    on_hold:     by_status['On Hold']     || 0,
    rag_red_projects:     data.filter(d => d.rag    === 'R'),
    blocked_projects:     data.filter(d => d.status === 'Blocked'),
    mc_required_projects: data.filter(d => d.mc     === 'Yes'),
  });
};
