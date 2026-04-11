window.Components = window.Components || {};

window.Components.OutputsView = function () {
  const section = document.createElement('section');
  section.className = 'card glass entrance view';
  section.dataset.view = 'outputs';

  const top = document.createElement('div');
  top.className = 'view-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Rendered Outputs';
  const sub = document.createElement('div');
  sub.className = 'view-subtitle';
  sub.textContent = 'Browse the current session outputs from the same `data.json` + `master.mp4` artifact layout the desktop app already uses.';
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);

  const actionRow = document.createElement('div');
  actionRow.className = 'workspace-actions';
  const back = document.createElement('button');
  back.className = 'btn ghost';
  back.textContent = 'Back to Workspace';
  const refresh = document.createElement('button');
  refresh.className = 'btn ghost';
  refresh.textContent = 'Refresh Outputs';
  actionRow.appendChild(back);
  actionRow.appendChild(refresh);

  const sessionTitle = document.createElement('div');
  sessionTitle.className = 'workspace-title';
  const sessionMeta = document.createElement('div');
  sessionMeta.className = 'workspace-meta';
  const status = document.createElement('div');
  status.className = 'status';
  const list = document.createElement('div');
  list.className = 'output-list';

  top.appendChild(titleWrap);
  top.appendChild(actionRow);

  section.appendChild(top);
  section.appendChild(sessionTitle);
  section.appendChild(sessionMeta);
  section.appendChild(status);
  section.appendChild(list);

  return {
    element: section,
    fields: {
      back,
      refresh,
      sessionTitle,
      sessionMeta,
      status,
      list
    }
  };
};
