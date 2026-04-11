const root = document.getElementById('app');
const shell = document.createElement('div');
shell.className = 'shell';
root.appendChild(shell);

const header = window.Components.Header();
shell.appendChild(header.element);

const main = document.createElement('main');
main.className = 'main';
shell.appendChild(main);

const aiView = window.Components.AiSettingsView();
const homeView = window.Components.HomeView();
const sessionsView = window.Components.SessionsView();
const workspaceView = window.Components.WorkspaceView();
const outputsView = window.Components.OutputsView();
main.appendChild(aiView.element);
main.appendChild(homeView.element);
main.appendChild(sessionsView.element);
main.appendChild(workspaceView.element);
main.appendChild(outputsView.element);

const navButtons = header.buttons;
const views = [aiView.element, homeView.element, sessionsView.element, workspaceView.element, outputsView.element];

let polling = null;
let iconTriedData = false;
const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none"><rect width="96" height="96" rx="18" fill="#0B1B24"/><path d="M18 36h60v36a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V36Z" fill="#12BFE4"/><path d="M20 20l10 10m6-10 10 10m6-10 10 10m6-10 10 10" stroke="#12BFE4" stroke-width="6" stroke-linecap="round"/></svg>`;
let providerType = 'ytclip';
let workspaceState = null;
let activeHighlightId = null;
let selectedHighlightIds = [];

function waitForApi() {
  return new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) {
      resolve();
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (window.pywebview && window.pywebview.api) {
        clearInterval(timer);
        resolve();
      } else if (tries > 50) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function toFileUrl(path) {
  if (!path) return '';
  if (path.startsWith('file://')) return path;
  const fixed = path.replace(/\\/g, '/');
  return 'file:///' + fixed;
}

function lockControls(state) {
  homeView.fields.url.disabled = state;
  homeView.fields.clips.disabled = state;
  homeView.fields.subtitle.disabled = state;
  homeView.fields.captions.disabled = state;
  homeView.fields.hook.disabled = state;
  homeView.fields.start.disabled = state;
}

function setActiveView(name, navName = name) {
  views.forEach((view) => {
    view.classList.toggle('active', view.dataset.view === name);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === navName);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getWorkspaceSessionRef() {
  const session = (workspaceState && workspaceState.session) || {};
  return {
    session_id: session.session_id,
    session_dir: session.session_dir
  };
}

function setWorkspaceStatus(text) {
  workspaceView.fields.status.textContent = text || '';
}

function syncWorkspaceSelectionFromPayload() {
  if (!workspaceState) {
    activeHighlightId = null;
    selectedHighlightIds = [];
    return;
  }

  const payloadSelected = Array.isArray(workspaceState.default_selected_ids)
    ? workspaceState.default_selected_ids.filter(Boolean)
    : [];
  selectedHighlightIds = [...payloadSelected];

  const payloadActive = workspaceState.workspace_state && workspaceState.workspace_state.active_highlight_id;
  const availableHighlights = (workspaceState.highlights || []).map((item) => item.highlight_id).filter(Boolean);
  if (payloadActive && availableHighlights.includes(payloadActive)) {
    activeHighlightId = payloadActive;
    return;
  }
  if (activeHighlightId && availableHighlights.includes(activeHighlightId)) {
    return;
  }
  activeHighlightId = availableHighlights[0] || null;
}

function readActiveHighlightDraft() {
  return {
    title: workspaceView.fields.titleInput.value.trim(),
    description: workspaceView.fields.descriptionInput.value.trim(),
    hook_text: workspaceView.fields.hookInput.value.trim(),
    caption_override: workspaceView.fields.captionOverrideInput.value.trim(),
    tracking_mode: workspaceView.fields.trackingMode.value,
    caption_mode: workspaceView.fields.captionMode.value,
    tts_voice: workspaceView.fields.ttsVoice.value.trim(),
    source_credit_enabled: workspaceView.fields.sourceCredit.checked,
    watermark_preset: workspaceView.fields.watermarkPreset.value.trim() || 'default'
  };
}

function getActiveHighlight() {
  const highlights = (workspaceState && workspaceState.highlights) || [];
  return highlights.find((item) => item.highlight_id === activeHighlightId) || null;
}

function renderSessionCards(items) {
  sessionsView.fields.list.innerHTML = '';
  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card-copy';
    empty.textContent = 'No session manifests found yet.';
    sessionsView.fields.list.appendChild(empty);
    return;
  }

  items.forEach((session) => {
    const card = document.createElement('div');
    card.className = 'session-card';

    const top = document.createElement('div');
    top.className = 'card-row';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = session.title || session.session_id || 'Untitled Session';
    const badge = document.createElement('div');
    badge.className = 'pill';
    badge.textContent = String(session.status || 'unknown').replace(/_/g, ' ');
    top.appendChild(title);
    top.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = [
      session.session_id,
      session.campaign_label ? `Campaign ${session.campaign_label}` : null,
      session.channel || null,
      `${session.highlight_count || 0} highlights`,
      `${session.clip_job_count || 0} clip jobs`
    ].filter(Boolean).join(' • ');

    const actions = document.createElement('div');
    actions.className = 'workspace-actions';
    const open = document.createElement('button');
    open.className = 'btn primary';
    open.textContent = 'Open Workspace';
    open.addEventListener('click', () => loadWorkspace(session.session_id));
    actions.appendChild(open);

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(actions);
    sessionsView.fields.list.appendChild(card);
  });
}

function renderSourceRows(rows) {
  workspaceView.fields.sourceRows.innerHTML = '';
  (rows || []).forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'source-row';
    const rowLabel = document.createElement('div');
    rowLabel.className = 'source-label';
    rowLabel.textContent = label;
    const rowValue = document.createElement('div');
    rowValue.className = 'source-value';
    rowValue.textContent = value || '-';
    row.appendChild(rowLabel);
    row.appendChild(rowValue);
    workspaceView.fields.sourceRows.appendChild(row);
  });
}

function renderHighlightList() {
  const highlights = (workspaceState && workspaceState.highlights) || [];
  workspaceView.fields.highlightList.innerHTML = '';
  if (!highlights.length) {
    const empty = document.createElement('div');
    empty.className = 'card-copy';
    empty.textContent = 'No highlights found in this session.';
    workspaceView.fields.highlightList.appendChild(empty);
    return;
  }

  highlights.forEach((highlight) => {
    const card = document.createElement('div');
    card.className = 'highlight-card' + (highlight.highlight_id === activeHighlightId ? ' active' : '');

    const selectRow = document.createElement('div');
    selectRow.className = 'highlight-select-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'highlight-checkbox';
    checkbox.checked = selectedHighlightIds.includes(highlight.highlight_id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (!selectedHighlightIds.includes(highlight.highlight_id)) {
          selectedHighlightIds.push(highlight.highlight_id);
        }
      } else {
        selectedHighlightIds = selectedHighlightIds.filter((id) => id !== highlight.highlight_id);
      }
      renderWorkspace();
    });

    const title = document.createElement('button');
    title.className = 'btn ghost';
    title.textContent = highlight.title || 'Untitled Highlight';
    title.addEventListener('click', () => {
      activeHighlightId = highlight.highlight_id;
      renderWorkspace();
    });
    selectRow.appendChild(checkbox);
    selectRow.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = [
      highlight.time_range || null,
      highlight.duration_seconds ? `${Math.round(Number(highlight.duration_seconds))}s` : null,
      highlight.clip_status ? String(highlight.clip_status).replace(/_/g, ' ') : null
    ].filter(Boolean).join(' • ');

    const copy = document.createElement('div');
    copy.className = 'card-copy';
    copy.textContent = highlight.description || 'No draft description yet.';

    card.appendChild(selectRow);
    card.appendChild(meta);
    card.appendChild(copy);
    workspaceView.fields.highlightList.appendChild(card);
  });
}

function renderEditor() {
  const highlight = getActiveHighlight();
  const defaults = (workspaceState && workspaceState.editor_defaults) || {};
  workspaceView.fields.hint.textContent = (workspaceState && workspaceState.editor_defaults_hint) || '';

  if (!highlight) {
    workspaceView.fields.titleInput.value = '';
    workspaceView.fields.descriptionInput.value = '';
    workspaceView.fields.hookInput.value = '';
    workspaceView.fields.captionOverrideInput.value = '';
    workspaceView.fields.trackingMode.value = 'center_crop';
    workspaceView.fields.captionMode.value = 'auto';
    workspaceView.fields.ttsVoice.value = defaults.tts_voice || 'nova';
    workspaceView.fields.watermarkPreset.value = defaults.watermark_preset || 'default';
    workspaceView.fields.sourceCredit.checked = Boolean(defaults.source_credit_enabled);
    return;
  }

  const editor = highlight.editor || {};
  workspaceView.fields.titleInput.value = highlight.title || '';
  workspaceView.fields.descriptionInput.value = highlight.description || '';
  workspaceView.fields.hookInput.value = highlight.hook_text || '';
  workspaceView.fields.captionOverrideInput.value = editor.caption_override || '';
  workspaceView.fields.trackingMode.value = editor.tracking_mode || 'center_crop';
  workspaceView.fields.captionMode.value = editor.caption_mode || 'auto';
  workspaceView.fields.ttsVoice.value = editor.tts_voice || defaults.tts_voice || 'nova';
  workspaceView.fields.watermarkPreset.value = editor.watermark_preset || defaults.watermark_preset || 'default';
  workspaceView.fields.sourceCredit.checked = Boolean(
    editor.source_credit_enabled !== undefined ? editor.source_credit_enabled : defaults.source_credit_enabled
  );
}

function renderOutputs() {
  const outputs = (workspaceState && workspaceState.output_clips) || [];
  workspaceView.fields.outputList.innerHTML = '';
  if (!outputs.length) {
    const empty = document.createElement('div');
    empty.className = 'card-copy';
    empty.textContent = 'No clip outputs yet. Render selected highlights to populate this area.';
    workspaceView.fields.outputList.appendChild(empty);
    return;
  }

  outputs.forEach((clip) => {
    const card = document.createElement('div');
    card.className = 'output-card';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = clip.title || clip.clip_id || 'Untitled Clip';
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = [
      clip.clip_id,
      clip.duration ? `${Math.round(Number(clip.duration))}s` : null,
      clip.revision_label,
      clip.status ? String(clip.status).replace(/_/g, ' ') : null
    ].filter(Boolean).join(' • ');
    const hook = document.createElement('div');
    hook.className = 'card-copy';
    hook.textContent = clip.hook_text || 'Rendered output available';
    const links = document.createElement('div');
    links.className = 'output-links';
    if (clip.master_path) {
      const video = document.createElement('a');
      video.className = 'mini-link';
      video.href = toFileUrl(clip.master_path);
      video.target = '_blank';
      video.textContent = 'Open master.mp4';
      links.appendChild(video);
    }
    if (clip.data_path) {
      const data = document.createElement('a');
      data.className = 'mini-link';
      data.href = toFileUrl(clip.data_path);
      data.target = '_blank';
      data.textContent = 'Open data.json';
      links.appendChild(data);
    }
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(hook);
    card.appendChild(links);
    workspaceView.fields.outputList.appendChild(card);
  });
}

function renderOutputsView() {
  const session = (workspaceState && workspaceState.session) || {};
  const outputs = (workspaceState && workspaceState.output_clips) || [];
  outputsView.fields.list.innerHTML = '';
  outputsView.fields.sessionTitle.textContent = (session.video_info && session.video_info.title) || session.session_id || 'No Session Loaded';
  outputsView.fields.sessionMeta.textContent = [
    session.session_id,
    session.campaign_label ? `Campaign ${session.campaign_label}` : null,
    `${outputs.length} rendered clips`
  ].filter(Boolean).join(' • ');

  if (!workspaceState) {
    outputsView.fields.status.textContent = 'Load a session workspace first to browse outputs.';
    return;
  }

  if (!outputs.length) {
    outputsView.fields.status.textContent = 'No rendered clips yet for this session.';
    const empty = document.createElement('div');
    empty.className = 'card-copy';
    empty.textContent = 'Render selected highlights from the workspace to populate this output library.';
    outputsView.fields.list.appendChild(empty);
    return;
  }

  outputsView.fields.status.textContent = 'Showing the current session output library.';
  outputs.forEach((clip) => {
    const card = document.createElement('div');
    card.className = 'output-card';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = clip.title || clip.clip_id || 'Untitled Clip';
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = [
      clip.clip_id,
      clip.duration ? `${Math.round(Number(clip.duration))}s` : null,
      clip.revision_label,
      clip.status ? String(clip.status).replace(/_/g, ' ') : null
    ].filter(Boolean).join(' • ');
    const hook = document.createElement('div');
    hook.className = 'card-copy';
    hook.textContent = clip.hook_text || 'Rendered output available';
    const links = document.createElement('div');
    links.className = 'output-links';
    if (clip.master_path) {
      const video = document.createElement('a');
      video.className = 'mini-link';
      video.href = toFileUrl(clip.master_path);
      video.target = '_blank';
      video.textContent = 'Open master.mp4';
      links.appendChild(video);
    }
    if (clip.data_path) {
      const data = document.createElement('a');
      data.className = 'mini-link';
      data.href = toFileUrl(clip.data_path);
      data.target = '_blank';
      data.textContent = 'Open data.json';
      links.appendChild(data);
    }
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(hook);
    card.appendChild(links);
    outputsView.fields.list.appendChild(card);
  });
}

function renderWorkspace() {
  const session = (workspaceState && workspaceState.session) || {};
  workspaceView.fields.sessionTitle.textContent = (session.video_info && session.video_info.title) || session.session_id || 'Session Workspace';
  workspaceView.fields.sessionMeta.textContent = [
    session.session_id,
    session.campaign_label ? `Campaign ${session.campaign_label}` : null,
    session.last_error ? `Last error: ${session.last_error}` : null
  ].filter(Boolean).join(' • ');
  workspaceView.fields.provider.textContent = (workspaceState && workspaceState.provider_summary) || '';
  workspaceView.fields.statusBadge.textContent = String(session.status || session.stage || 'unknown').replace(/_/g, ' ');
  const queue = (workspaceState && workspaceState.queue_summary) || {};
  workspaceView.fields.queueSummary.textContent = [
    `Selected highlights: ${selectedHighlightIds.length}`,
    `Tracked clip jobs: ${queue.total || 0}`,
    `Queued ${queue.queued || 0} • Rendering ${queue.rendering || 0}`,
    `Completed ${queue.completed || 0} • Dirty ${queue.dirty || 0} • Failed ${queue.failed || 0}`
  ].join('\n');

  const state = (workspaceState && workspaceState.workspace_state) || {};
  workspaceView.fields.addHook.checked = Boolean(state.add_hook !== undefined ? state.add_hook : true);
  workspaceView.fields.addCaptions.checked = Boolean(state.add_captions !== undefined ? state.add_captions : true);

  renderSourceRows((workspaceState && workspaceState.source_rows) || []);
  renderHighlightList();
  renderEditor();
  renderOutputs();
}

async function loadSessions(showView = false) {
  sessionsView.fields.status.textContent = 'Loading sessions...';
  try {
    const res = await window.pywebview.api.list_sessions();
    renderSessionCards((res && res.sessions) || []);
    sessionsView.fields.status.textContent = `${((res && res.sessions) || []).length} sessions loaded`;
    if (showView) {
      setActiveView('sessions');
    }
  } catch (error) {
    sessionsView.fields.status.textContent = 'Failed to load sessions';
    sessionsView.fields.list.innerHTML = `<div class="card-copy">${escapeHtml(error && error.message)}</div>`;
  }
}

async function loadWorkspace(sessionId) {
  setWorkspaceStatus('Loading workspace...');
  try {
    const res = await window.pywebview.api.get_session_workspace({ session_id: sessionId });
    if (!res || res.status !== 'ok') {
      throw new Error((res && res.message) || 'Failed to load workspace');
    }
    workspaceState = res.workspace;
    syncWorkspaceSelectionFromPayload();
    renderWorkspace();
    renderOutputsView();
    setWorkspaceStatus('Workspace ready');
    setActiveView('workspace', 'sessions');
  } catch (error) {
    setWorkspaceStatus((error && error.message) || 'Failed to load workspace');
  }
}

async function saveWorkspaceDraft() {
  if (!workspaceState || !activeHighlightId) {
    setWorkspaceStatus('Pick a highlight first');
    return false;
  }
  setWorkspaceStatus('Saving draft...');
  try {
    const res = await window.pywebview.api.save_session_workspace({
      ...getWorkspaceSessionRef(),
      highlight_id: activeHighlightId,
      updates: readActiveHighlightDraft(),
      selected_highlight_ids: selectedHighlightIds,
      active_highlight_id: activeHighlightId,
      add_hook: workspaceView.fields.addHook.checked,
      add_captions: workspaceView.fields.addCaptions.checked
    });
    if (!res || res.status !== 'saved') {
      throw new Error((res && res.message) || 'Failed to save workspace');
    }
    workspaceState = res.workspace;
    syncWorkspaceSelectionFromPayload();
    renderWorkspace();
    renderOutputsView();
    setWorkspaceStatus('Draft saved');
    return true;
  } catch (error) {
    setWorkspaceStatus((error && error.message) || 'Failed to save workspace');
    return false;
  }
}

function beginTaskPolling(onDone) {
  if (polling) {
    clearInterval(polling);
    polling = null;
  }
  polling = setInterval(async () => {
    try {
      const p = await window.pywebview.api.get_progress();
      setWorkspaceStatus(p.status || 'Running');
      if (p.status && (p.status.startsWith('error') || p.status === 'complete')) {
        clearInterval(polling);
        polling = null;
        if (p.status === 'complete') {
          await onDone();
        }
      }
    } catch {
      clearInterval(polling);
      polling = null;
      setWorkspaceStatus('Progress polling stopped');
    }
  }, 600);
}

async function renderWorkspaceSelection(retryFailed = false) {
  if (!workspaceState) {
    setWorkspaceStatus('Load a session first');
    return;
  }
  if (!retryFailed && selectedHighlightIds.length === 0) {
    setWorkspaceStatus('Select at least one highlight before rendering');
    return;
  }

  const saved = await saveWorkspaceDraft();
  if (!saved) {
    return;
  }
  setWorkspaceStatus(retryFailed ? 'Retrying failed clips...' : 'Starting render...');
  try {
    const payload = {
      ...getWorkspaceSessionRef(),
      highlight_ids: selectedHighlightIds,
      add_hook: workspaceView.fields.addHook.checked,
      add_captions: workspaceView.fields.addCaptions.checked
    };
    const res = retryFailed
      ? await window.pywebview.api.retry_session_failed(payload)
      : await window.pywebview.api.render_session_selection(payload);
    if (!res || res.status !== 'started') {
      throw new Error((res && res.message) || 'Render did not start');
    }
    beginTaskPolling(async () => {
      await loadWorkspace(getWorkspaceSessionRef().session_id);
      setWorkspaceStatus('Render complete');
    });
  } catch (error) {
    setWorkspaceStatus((error && error.message) || 'Render failed to start');
  }
}

function setProviderType(type, applyBaseUrl) {
  providerType = type;
  aiView.fields.providerButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.provider === type);
  });
  const showCustom = type === 'custom';
  aiView.fields.hfUrlField.classList.toggle('hidden', !showCustom);
  aiView.fields.cmUrlField.classList.toggle('hidden', !showCustom);
  aiView.fields.hmUrlField.classList.toggle('hidden', !showCustom);
  if (applyBaseUrl && !showCustom) {
    const baseUrl = type === 'ytclip' ? 'https://ai-api.ytclip.org/v1' : 'https://api.openai.com/v1';
    aiView.fields.hfUrl.value = baseUrl;
    aiView.fields.cmUrl.value = baseUrl;
    aiView.fields.hmUrl.value = baseUrl;
  }
}

function setSelectOptions(select, models, preferred) {
  select.innerHTML = '';
  if (!models || models.length === 0) {
    const opt = document.createElement('option');
    opt.value = preferred || '';
    opt.textContent = preferred || 'No models';
    select.appendChild(opt);
    return;
  }
  models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
  if (preferred && models.includes(preferred)) {
    select.value = preferred;
  }
}

function toggleEye(input, button) {
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button.textContent = visible ? '👁' : '🙈';
}

function getSvgDataUrl() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(fallbackSvg);
}

async function setIconFromApi() {
  if (iconTriedData) return;
  iconTriedData = true;
  try {
    const icon = await window.pywebview.api.get_icon_data();
    if (icon && icon.data) {
      header.icon.src = icon.data;
    }
  } catch {}
}

function setIconFallback() {
  header.icon.onerror = () => {
    setIconFromApi();
  };
  header.icon.src = getSvgDataUrl();
}

async function start() {
  const url = homeView.fields.url.value.trim();
  if (!url) return;
  lockControls(true);
  homeView.fields.status.textContent = 'Starting';
  homeView.fields.bar.style.width = '0%';
  try {
    const res = await window.pywebview.api.start_processing(
      url,
      parseInt(homeView.fields.clips.value, 10),
      homeView.fields.captions.checked,
      homeView.fields.hook.checked,
      homeView.fields.subtitle.value
    );
    if (res && res.status === 'started') {
      poll();
      polling = setInterval(poll, 500);
    } else {
      homeView.fields.status.textContent = 'Busy';
      lockControls(false);
    }
  } catch (e) {
    homeView.fields.status.textContent = 'Error';
    lockControls(false);
  }
}

async function poll() {
  try {
    const p = await window.pywebview.api.get_progress();
    const pr = Math.max(0, Math.min(1, p.progress || 0));
    homeView.fields.bar.style.width = (pr * 100).toFixed(1) + '%';
    homeView.fields.status.textContent = p.status || '';
    if (p.status && (p.status.startsWith('error') || p.status === 'complete')) {
      clearInterval(polling);
      polling = null;
      lockControls(false);
    }
  } catch {
    clearInterval(polling);
    polling = null;
    lockControls(false);
  }
}

homeView.fields.start.addEventListener('click', start);
sessionsView.fields.refresh.addEventListener('click', () => loadSessions(true));
workspaceView.fields.back.addEventListener('click', () => setActiveView('sessions'));
workspaceView.fields.refresh.addEventListener('click', async () => {
  if (!workspaceState) return;
  await loadWorkspace(getWorkspaceSessionRef().session_id);
});
workspaceView.fields.save.addEventListener('click', saveWorkspaceDraft);
workspaceView.fields.render.addEventListener('click', () => renderWorkspaceSelection(false));
workspaceView.fields.retry.addEventListener('click', () => renderWorkspaceSelection(true));
workspaceView.fields.outputs.addEventListener('click', () => {
  renderOutputsView();
  setActiveView('outputs', 'outputs');
});
outputsView.fields.back.addEventListener('click', () => setActiveView('workspace', 'sessions'));
outputsView.fields.refresh.addEventListener('click', async () => {
  if (!workspaceState) {
    renderOutputsView();
    return;
  }
  await loadWorkspace(getWorkspaceSessionRef().session_id);
  setActiveView('outputs', 'outputs');
});

navButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.dataset.view === 'sessions') {
      await loadSessions(true);
      return;
    }
    if (btn.dataset.view === 'outputs') {
      renderOutputsView();
      setActiveView('outputs', 'outputs');
      return;
    }
    setActiveView(btn.dataset.view);
  });
});

aiView.fields.saveBtn.addEventListener('click', async () => {
  const payload = {
    _provider_type: providerType,
    highlight_finder: {
      base_url: aiView.fields.hfUrl.value.trim(),
      api_key: aiView.fields.hfKey.value.trim(),
      model: aiView.fields.hfModel.value.trim()
    },
    caption_maker: {
      base_url: aiView.fields.cmUrl.value.trim(),
      api_key: aiView.fields.cmKey.value.trim(),
      model: aiView.fields.cmModel.value.trim()
    },
    hook_maker: {
      base_url: aiView.fields.hmUrl.value.trim(),
      api_key: aiView.fields.hmKey.value.trim(),
      model: aiView.fields.hmModel.value.trim()
    }
  };
  aiView.fields.status.textContent = 'Saving';
  try {
    const res = await window.pywebview.api.save_ai_settings(payload);
    aiView.fields.status.textContent = res && res.status === 'saved' ? 'Saved' : 'Error';
  } catch {
    aiView.fields.status.textContent = 'Error';
  }
});

async function init() {
  await waitForApi();
  setIconFallback();
  await setIconFromApi();
  if (!header.icon.src) {
    try {
      const paths = await window.pywebview.api.get_asset_paths();
      if (paths && paths.icon) {
        header.icon.src = toFileUrl(paths.icon);
      }
    } catch {}
  }
  try {
    const ai = await window.pywebview.api.get_ai_settings();
    const hf = ai.highlight_finder || {};
    const cm = ai.caption_maker || {};
    const hm = ai.hook_maker || {};
    aiView.fields.hfUrl.value = hf.base_url || '';
    aiView.fields.hfKey.value = hf.api_key || '';
    setSelectOptions(aiView.fields.hfModel, [hf.model].filter(Boolean), hf.model || '');
    aiView.fields.cmUrl.value = cm.base_url || '';
    aiView.fields.cmKey.value = cm.api_key || '';
    setSelectOptions(aiView.fields.cmModel, [cm.model].filter(Boolean), cm.model || '');
    aiView.fields.hmUrl.value = hm.base_url || '';
    aiView.fields.hmKey.value = hm.api_key || '';
    setSelectOptions(aiView.fields.hmModel, [hm.model].filter(Boolean), hm.model || '');
  } catch {}
  try {
    const provider = await window.pywebview.api.get_provider_type();
    providerType = provider.provider_type || 'ytclip';
  } catch {}
  setProviderType(providerType, true);
  await loadSessions(false);
  renderOutputsView();
  setActiveView('home');
}

aiView.fields.providerButtons.forEach((btn) => {
  btn.addEventListener('click', () => setProviderType(btn.dataset.provider, true));
});

aiView.fields.hfEye.addEventListener('click', () => toggleEye(aiView.fields.hfKey, aiView.fields.hfEye));
aiView.fields.cmEye.addEventListener('click', () => toggleEye(aiView.fields.cmKey, aiView.fields.cmEye));
aiView.fields.hmEye.addEventListener('click', () => toggleEye(aiView.fields.hmKey, aiView.fields.hmEye));

async function validateAndLoad(kind) {
  const baseUrl = kind.url.value.trim();
  const apiKey = kind.key.value.trim();
  kind.status.textContent = 'Validating';
  const res = await window.pywebview.api.validate_api_key(baseUrl, apiKey);
  if (!res || res.status !== 'ok') {
    kind.status.textContent = res && res.message ? res.message : 'Invalid';
    return;
  }
  kind.status.textContent = 'Loading models';
  const modelsRes = await window.pywebview.api.get_models(baseUrl, apiKey);
  const models = (modelsRes && modelsRes.models) || [];
  setSelectOptions(kind.model, models, kind.model.value);
  kind.status.textContent = models.length ? 'Valid' : 'Valid, no models';
}

aiView.fields.hfValidateBtn.addEventListener('click', () => validateAndLoad({
  url: aiView.fields.hfUrl,
  key: aiView.fields.hfKey,
  model: aiView.fields.hfModel,
  status: aiView.fields.hfValidateStatus
}));

aiView.fields.cmValidateBtn.addEventListener('click', () => validateAndLoad({
  url: aiView.fields.cmUrl,
  key: aiView.fields.cmKey,
  model: aiView.fields.cmModel,
  status: aiView.fields.cmValidateStatus
}));

aiView.fields.hmValidateBtn.addEventListener('click', () => validateAndLoad({
  url: aiView.fields.hmUrl,
  key: aiView.fields.hmKey,
  model: aiView.fields.hmModel,
  status: aiView.fields.hmValidateStatus
}));

window.addEventListener('pywebviewready', init);
setTimeout(() => init(), 800);
