window.Components = window.Components || {};

window.Components.SessionsView = function () {
  const section = document.createElement('section');
  section.className = 'card glass entrance view';
  section.dataset.view = 'sessions';

  const top = document.createElement('div');
  top.className = 'view-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Sessions';
  const sub = document.createElement('div');
  sub.className = 'view-subtitle';
  sub.textContent = 'Resume real session manifests and continue editing or rendering from the web shell.';
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);

  const refresh = document.createElement('button');
  refresh.className = 'btn ghost';
  refresh.textContent = 'Refresh';

  top.appendChild(titleWrap);
  top.appendChild(refresh);

  const status = document.createElement('div');
  status.className = 'status';

  const list = document.createElement('div');
  list.className = 'session-list';

  section.appendChild(top);
  section.appendChild(status);
  section.appendChild(list);

  return {
    element: section,
    fields: {
      refresh,
      status,
      list
    }
  };
};
