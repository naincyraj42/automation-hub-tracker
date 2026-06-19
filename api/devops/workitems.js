const supabase = require('../_db');

const ADO_ORG     = process.env.ADO_ORG     || 'ksec-devops';
const ADO_PROJECT = process.env.ADO_PROJECT  || 'Ksec-%20Backoffice';
const ADO_PAT     = process.env.ADO_PAT;

function adoHeaders() {
  const token = Buffer.from(':' + ADO_PAT).toString('base64');
  return {
    'Authorization': 'Basic ' + token,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
}

const ADO_BASE = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/devops/workitems — fetch all work items from ADO
  if (req.method === 'GET') {
    try {
      // WIQL query — get all active work items
      const wiql = {
        query: `SELECT [System.Id],[System.Title],[System.State],[System.AssignedTo],[System.IterationPath],[System.WorkItemType],[Microsoft.VSTS.Common.Priority],[System.Tags]
                FROM WorkItems
                WHERE [System.TeamProject] = @project
                AND [System.State] NOT IN ('Removed','Closed')
                ORDER BY [System.ChangedDate] DESC`
      };

      const qRes = await fetch(
        `${ADO_BASE}/wit/wiql?api-version=7.1`,
        { method: 'POST', headers: adoHeaders(), body: JSON.stringify(wiql) }
      );
      if (!qRes.ok) {
        const err = await qRes.text();
        return res.status(qRes.status).json({ error: 'ADO WIQL failed: ' + err });
      }
      const qData = await qRes.json();
      const ids = (qData.workItems || []).slice(0, 100).map(w => w.id);

      if (!ids.length) return res.status(200).json({ count: 0, items: [] });

      // Batch fetch work item details
      const fields = [
        'System.Id','System.Title','System.State','System.WorkItemType',
        'System.AssignedTo','System.IterationPath','System.Tags',
        'Microsoft.VSTS.Common.Priority','System.Description',
        'Microsoft.VSTS.Common.StateChangeDate','System.CreatedDate'
      ].join(',');

      const detailRes = await fetch(
        `${ADO_BASE}/wit/workitems?ids=${ids.join(',')}&fields=${fields}&api-version=7.1`,
        { headers: adoHeaders() }
      );
      if (!detailRes.ok) {
        const err = await detailRes.text();
        return res.status(detailRes.status).json({ error: 'ADO detail fetch failed: ' + err });
      }
      const detailData = await detailRes.json();

      const items = (detailData.value || []).map(w => {
        const f = w.fields;
        const assignee = f['System.AssignedTo'];
        return {
          id:          w.id,
          title:       f['System.Title']         || '',
          state:       f['System.State']         || '',
          type:        f['System.WorkItemType']  || '',
          assignee:    typeof assignee === 'object' ? assignee.displayName : (assignee || ''),
          iteration:   f['System.IterationPath'] || '',
          priority:    f['Microsoft.VSTS.Common.Priority'] || '',
          tags:        f['System.Tags']          || '',
          created:     f['System.CreatedDate']   || '',
          url: `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_workitems/edit/${w.id}`,
        };
      });

      return res.status(200).json({ count: items.length, items });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST /api/devops/workitems — link an ADO work item to a tracker project
  if (req.method === 'POST') {
    const { project_id, work_item_id } = req.body || {};
    if (!project_id || !work_item_id)
      return res.status(400).json({ error: 'project_id and work_item_id are required' });

    try {
      // Verify work item exists in ADO
      const wiRes = await fetch(
        `${ADO_BASE}/wit/workitems/${work_item_id}?api-version=7.1`,
        { headers: adoHeaders() }
      );
      if (!wiRes.ok) return res.status(404).json({ error: 'Work item not found in Azure DevOps' });
      const wi = await wiRes.json();
      const f  = wi.fields;

      // Update Supabase project with ADO link
      const { data, error } = await supabase
        .from('projects')
        .update({
          ado_work_item_id:  work_item_id,
          ado_title:         f['System.Title']        || '',
          ado_state:         f['System.State']        || '',
          ado_iteration:     f['System.IterationPath']|| '',
          ado_url: `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_workitems/edit/${work_item_id}`,
        })
        .eq('id', project_id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ message: 'Linked successfully', data });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
