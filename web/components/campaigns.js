window.Components = window.Components || {};

window.Components.CampaignsView = function () {
  const section = document.createElement('section');
  section.className = 'card glass entrance view';
  section.dataset.view = 'campaigns';

  const top = document.createElement('div');
  top.className = 'view-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Campaign Dashboard';
  const sub = document.createElement('div');
  sub.className = 'view-subtitle';
  sub.textContent = 'Manage PaunClip campaigns, fetch channel videos, and continue processing from deterministic sessions.';
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);

  const actions = document.createElement('div');
  actions.className = 'workspace-actions';
  const refresh = document.createElement('button');
  refresh.className = 'btn ghost';
  refresh.textContent = 'Refresh';
  const rename = document.createElement('button');
  rename.className = 'btn ghost';
  rename.textContent = 'Rename';
  const archive = document.createElement('button');
  archive.className = 'btn ghost';
  archive.textContent = 'Archive';
  const open = document.createElement('button');
  open.className = 'btn primary';
  open.textContent = 'Open Queue';
  actions.appendChild(refresh);
  actions.appendChild(rename);
  actions.appendChild(archive);
  actions.appendChild(open);

  top.appendChild(titleWrap);
  top.appendChild(actions);

  const form = document.createElement('div');
  form.className = 'campaign-form';

  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.placeholder = 'Campaign name';
  const urlInput = document.createElement('input');
  urlInput.className = 'input';
  urlInput.placeholder = 'YouTube channel URL (optional)';
  const create = document.createElement('button');
  create.className = 'btn primary';
  create.textContent = 'Add Campaign';

  form.appendChild(nameInput);
  form.appendChild(urlInput);
  form.appendChild(create);

  const status = document.createElement('div');
  status.className = 'status';

  const list = document.createElement('div');
  list.className = 'campaign-list';

  section.appendChild(top);
  section.appendChild(form);
  section.appendChild(status);
  section.appendChild(list);

  return {
    element: section,
    fields: {
      refresh,
      rename,
      archive,
      open,
      nameInput,
      urlInput,
      create,
      status,
      list,
    },
  };
};
