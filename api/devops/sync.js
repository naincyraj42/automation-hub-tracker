const supabase = require('../_db');

const ADO_ORG     = process.env.ADO_ORG    || 'ksec-devops';
const ADO_PROJECT = process.env.ADO_PROJECT || 'Ksec-%20Backoffice';
const ADO_PAT     = process.env.ADO_PAT;

function adoHeaders() {
  const token = Buffer.from(':' + ADO_PAT).toString('base64');
  return { 'Authorization': 'Basic ' + token, 'Content-Type': 'application/json' };
}

const ADO_BASE = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis`;

// Map ADO state → tracker status
function adoStateToStatus(state) {
  const map = {
    'New': 'In Progress', 'Active': 'In Progress', 'In Progress': 'In Progress',
    'Resolved': 'Dev Complete', 'Closed': 'Live', 'Done': 'Live',
    'Blocked': 'Blocked', 'On Hold': 'On Hold', 'To Do': 'Pending',
  };
  return map[state] || 'In Progress';
}

// Map ADO priority → tracker priority
function adoPriorityToP(priority) {
  if (priority === 1) return 'P1';
  if (priority === 2) return 'P2';
  if (priority === 3) return 'P3';
  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Get all tracker projects that have an ADO work item linked
    const { data: projects, error: dbErr } = await supabase
      .from('projects')
      .select('id, project, ado_work_item_id')
      .not('ado_work_item_id', 'is', null);

    if (dbErr) return res.status(500).json({ error: dbErr.message });
    if (!projects.length) return res.status(200).json({ message: 'No linked projects to sync', synced: 0 });

    const ids = projects.map(p => p.ado_work_item_id).join(',');
    const fields = [
      'System.Id','System.Title','System.State','System.AssignedTo',
      'System.IterationPath','Microsoft.VSTS.Common.Priority','System.Tags'
    ].join(',');

    const adoRes = await fetch(
      `${ADO_BASE}/wit/workitems?ids=${ids}&fields=${fields}&api-version=7.1`,
      { headers: adoHeaders() }
    );
    if (!adoRes.ok) {
      const err = await adoRes.text();
      return res.status(500).json({ error: 'ADO fetch failed: ' + err });
    }
    const adoData = await adoRes.json();
    const wiMap   = {};
    (adoData.value || []).forEach(wi => { wiMap[wi.id] = wi.fields; });

    // Update each linked project in Supabase
    let synced = 0;
    for (const project of projects) {
      const f = wiMap[project.ado_work_item_id];
      if (!f) continue;
      const assignee = f['System.AssignedTo'];
      await supabase.from('projects').update({
        ado_state:     f['System.State']        || '',
        ado_title:     f['System.Title']        || '',
        ado_iteration: f['System.IterationPath']|| '',
        status:        adoStateToStatus(f['System.State']),
        priority:      adoPriorityToP(f['Microsoft.VSTS.Common.Priority']),
        owner:         typeof assignee === 'object' ? assignee.displayName : (assignee || project.owner || ''),
      }).eq('id', project.id);
      synced++;
    }

    return res.status(200).json({ message: `Synced ${synced} projects from Azure DevOps`, synced });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
