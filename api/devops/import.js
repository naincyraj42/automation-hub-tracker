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

const ADO_BASE = `https://dev.azure.com/${ADO_ORG}/${encodeURIComponent(ADO_PROJECT.replace(/%20/g,' '))}/_apis`;

// Map ADO state → tracker status
function mapStatus(state) {
  const m = {
    'New':'Requirement Gathering','To Do':'Requirement Gathering',
    'Active':'In Progress','In Progress':'In Progress','Doing':'In Progress',
    'Resolved':'Dev Complete','Done':'Live','Closed':'Live','Completed':'Live',
    'Blocked':'Blocked','On Hold':'On Hold','Removed':'On Hold',
  };
  return m[state] || 'In Progress';
}

// Map ADO priority number → P1/P2/P3
function mapPriority(p) {
  if (p === 1) return 'P1';
  if (p === 2) return 'P2';
  if (p === 3 || p === 4) return 'P3';
  return '';
}

// Derive maker-checker from work item type and tags
function deriveMC(type, tags, title) {
  const t = (title + ' ' + tags).toLowerCase();
  const financialKeywords = ['reco','reconcil','settlement','brokerage','incentive','pnl','p&l','pledge','margin','segregation','cibil','payment','financial','billing'];
  const regulatoryKeywords = ['regulatory','compliance','exchange','sebi','nse','bse','audit'];
  const sensitiveKeywords  = ['audio','pii','client','customer','data migration','upload'];
  
  if (financialKeywords.some(k => t.includes(k)) || regulatoryKeywords.some(k => t.includes(k))) {
    return { mc: 'Yes', mc_reason: 'Financial/regulatory output requires checker review before consumption.' };
  }
  if (sensitiveKeywords.some(k => t.includes(k))) {
    return { mc: 'Partial', mc_reason: 'Sensitive data involved; periodic review required.' };
  }
  if (type === 'Bug' || type === 'Task') {
    return { mc: 'No', mc_reason: 'Internal technical task; no external approval gate.' };
  }
  return { mc: 'Partial', mc_reason: 'Review recommended before production deployment.' };
}

// Map ADO area/iteration path to category
function mapCategory(areaPath, type) {
  const a = (areaPath || '').toLowerCase();
  if (a.includes('infra') || a.includes('server') || a.includes('devops')) return 'Infrastructure';
  if (a.includes('data') || a.includes('reco') || a.includes('migration')) return 'Data Reconciliation/Migration';
  if (a.includes('standard') || a.includes('template')) return 'Standardization';
  if (type === 'Feature' || type === 'User Story' || type === 'Epic') return 'Development';
  return 'Automation';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Step 1: WIQL — get all work items
    const wiql = {
      query: `SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType],
              [System.AssignedTo],[System.AreaPath],[System.IterationPath],
              [Microsoft.VSTS.Common.Priority],[System.Tags],[System.Description],
              [System.CreatedDate],[System.ChangedDate]
              FROM WorkItems
              WHERE [System.TeamProject] = @project
              AND [System.WorkItemType] IN ('Epic','Feature','User Story','Task','Bug','Issue')
              AND [System.State] NOT IN ('Removed')
              ORDER BY [System.ChangedDate] DESC`
    };

    const qRes = await fetch(
      `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/wit/wiql?api-version=7.1`,
      { method: 'POST', headers: adoHeaders(), body: JSON.stringify(wiql) }
    );

    if (!qRes.ok) {
      const err = await qRes.text();
      return res.status(qRes.status).json({ error: 'ADO WIQL failed: ' + err.slice(0,300) });
    }

    const qData  = await qRes.json();
    const allIds = (qData.workItems || []).map(w => w.id);

    if (!allIds.length) {
      return res.status(200).json({ message: 'No work items found in Azure DevOps', imported: 0 });
    }

    // Step 2: Fetch details in batches of 200
    const fields = [
      'System.Id','System.Title','System.State','System.WorkItemType',
      'System.AssignedTo','System.AreaPath','System.IterationPath',
      'System.Tags','System.Description','System.CreatedDate',
      'Microsoft.VSTS.Common.Priority','Microsoft.VSTS.Common.ResolvedDate',
      'Microsoft.VSTS.Scheduling.TargetDate',
    ].join(',');

    let allItems = [];
    for (let i = 0; i < allIds.length; i += 200) {
      const batch = allIds.slice(i, i + 200);
      const dRes  = await fetch(
        `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/wit/workitems?ids=${batch.join(',')}&fields=${fields}&api-version=7.1`,
        { headers: adoHeaders() }
      );
      if (!dRes.ok) continue;
      const dData = await dRes.json();
      allItems = allItems.concat(dData.value || []);
    }

    // Step 3: Transform ADO items → tracker projects
    const projects = allItems.map(wi => {
      const f        = wi.fields;
      const assignee = f['System.AssignedTo'];
      const owner    = typeof assignee === 'object' ? (assignee.displayName || '') : (assignee || '');
      const type     = f['System.WorkItemType'] || '';
      const state    = f['System.State']        || '';
      const tags     = f['System.Tags']         || '';
      const title    = f['System.Title']        || '';
      const area     = f['System.AreaPath']     || '';
      const iter     = f['System.IterationPath']|| '';
      const eta      = f['Microsoft.VSTS.Scheduling.TargetDate'] || '';
      const priority = f['Microsoft.VSTS.Common.Priority'];
      const { mc, mc_reason } = deriveMC(type, tags, title);

      // RAG based on state
      let rag = 'G';
      if (state === 'Blocked') rag = 'R';
      else if (['New','To Do','Requirement Gathering'].includes(state)) rag = 'A';

      return {
        project:        `#${wi.id} — ${title}`,
        category:       mapCategory(area, type),
        status:         mapStatus(state),
        priority:       mapPriority(priority),
        rag,
        owner,
        spoc:           '',
        tech:           tags.split(';').map(t=>t.trim()).filter(Boolean).slice(0,3).join(', '),
        blocker:        state === 'Blocked' ? 'Blocked in Azure DevOps' : '',
        eta:            eta ? eta.slice(0,10) : '',
        mc,
        mc_reason,
        current_status: `ADO ${type} · State: ${state} · Iteration: ${iter.split('\\').pop() || iter}`,
        ado_work_item_id: wi.id,
        ado_title:      title,
        ado_state:      state,
        ado_iteration:  iter,
        ado_url:        `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_workitems/edit/${wi.id}`,
      };
    });

    // Step 4: Clear existing and insert all from ADO
    const { error: delErr } = await supabase
      .from('projects')
      .delete()
      .neq('id', 0);

    if (delErr) return res.status(500).json({ error: 'Clear failed: ' + delErr.message });

    // Insert in batches of 50
    let imported = 0;
    for (let i = 0; i < projects.length; i += 50) {
      const batch = projects.slice(i, i + 50);
      const { error: insErr } = await supabase.from('projects').insert(batch);
      if (insErr) {
        console.error('Insert batch error:', insErr.message);
        continue;
      }
      imported += batch.length;
    }

    return res.status(200).json({
      message: `Imported ${imported} projects from Azure DevOps into tracker`,
      total_in_ado: allIds.length,
      imported,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
