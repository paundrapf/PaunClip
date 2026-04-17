window.Components = window.Components || {};

window.Components.CampaignQueueView = function () {
  const section = document.createElement('section');
  section.className = 'card glass entrance view';
  section.dataset.view = 'campaign-queue';

  const top = document.createElement('div');
  top.className = 'view-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Campaign Queue';
  const sub = document.createElement('div');
  sub.className = 'view-subtitle';
  sub.textContent = 'Fetch latest videos, queue items, and open deterministic session workspaces from the campaign flow.';
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);

  const navActions = document.createElement('div');
  navActions.className = 'workspace-actions';
  const back = document.createElement('button');
  back.className = 'btn ghost';
  back.textContent = 'Back to Campaigns';
  const queueAll = document.createElement('button');
  queueAll.className = 'btn ghost';
  queueAll.textContent = 'Queue All New';
  navActions.appendChild(back);
  navActions.appendChild(queueAll);

  top.appendChild(titleWrap);
  top.appendChild(navActions);

  const summary = document.createElement('div');
  summary.className = 'workspace-summary';
  const campaignTitle = document.createElement('div');
  campaignTitle.className = 'workspace-title';
  const campaignMeta = document.createElement('div');
  campaignMeta.className = 'workspace-meta';
  const queueBadge = document.createElement('div');
  queueBadge.className = 'pill';
  summary.appendChild(campaignTitle);
  summary.appendChild(campaignMeta);
  summary.appendChild(queueBadge);

  const channelRow = document.createElement('div');
  channelRow.className = 'campaign-form';
  const channelUrl = document.createElement('input');
  channelUrl.className = 'input';
  channelUrl.placeholder = 'YouTube channel URL';
  const fetchBtn = document.createElement('button');
  fetchBtn.className = 'btn primary';
  fetchBtn.textContent = 'Fetch Latest Videos';
  channelRow.appendChild(channelUrl);
  channelRow.appendChild(fetchBtn);

  const status = document.createElement('div');
  status.className = 'status';

  const list = document.createElement('div');
  list.className = 'campaign-queue-list';

  section.appendChild(top);
  section.appendChild(summary);
  section.appendChild(channelRow);
  section.appendChild(status);
  section.appendChild(list);

  return {
    element: section,
    fields: {
      back,
      queueAll,
      campaignTitle,
      campaignMeta,
      queueBadge,
      channelUrl,
      fetchBtn,
      status,
      list,
    },
  };
};
