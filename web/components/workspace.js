window.Components = window.Components || {};

window.Components.WorkspaceView = function () {
  const section = document.createElement('section');
  section.className = 'card glass entrance view';
  section.dataset.view = 'workspace';

  const top = document.createElement('div');
  top.className = 'view-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Session Workspace';
  const sub = document.createElement('div');
  sub.className = 'view-subtitle';
  sub.textContent = 'Load one session, tweak the current clip draft, and render from the same persisted artifacts the desktop app uses.';
  titleWrap.appendChild(title);
  titleWrap.appendChild(sub);

  const actionRow = document.createElement('div');
  actionRow.className = 'workspace-actions';

  function makeButton(text, className) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = text;
    return btn;
  }

  const back = makeButton('Back to Sessions', 'btn ghost');
  const refresh = makeButton('Refresh', 'btn ghost');
  const save = makeButton('Save Draft', 'btn ghost');
  const render = makeButton('Render Selected', 'btn primary');
  const retry = makeButton('Retry Failed', 'btn ghost');
  const outputs = makeButton('View Outputs', 'btn ghost');

  actionRow.appendChild(back);
  actionRow.appendChild(refresh);
  actionRow.appendChild(save);
  actionRow.appendChild(render);
  actionRow.appendChild(retry);
  actionRow.appendChild(outputs);

  const summary = document.createElement('div');
  summary.className = 'workspace-summary';

  const sessionTitle = document.createElement('div');
  sessionTitle.className = 'workspace-title';
  const sessionMeta = document.createElement('div');
  sessionMeta.className = 'workspace-meta';
  const provider = document.createElement('div');
  provider.className = 'workspace-provider';
  const statusBadge = document.createElement('div');
  statusBadge.className = 'pill';

  summary.appendChild(sessionTitle);
  summary.appendChild(sessionMeta);
  summary.appendChild(provider);
  summary.appendChild(statusBadge);

  const status = document.createElement('div');
  status.className = 'status';

  const shell = document.createElement('div');
  shell.className = 'workspace-shell';

  const left = document.createElement('div');
  left.className = 'workspace-column';
  const right = document.createElement('div');
  right.className = 'workspace-column';

  shell.appendChild(left);
  shell.appendChild(right);

  const sourceCard = document.createElement('div');
  sourceCard.className = 'workspace-panel';
  const sourceTitle = document.createElement('div');
  sourceTitle.className = 'panel-title';
  sourceTitle.textContent = 'Source Summary';
  const sourceRows = document.createElement('div');
  sourceRows.className = 'source-grid';
  sourceCard.appendChild(sourceTitle);
  sourceCard.appendChild(sourceRows);

  const queueCard = document.createElement('div');
  queueCard.className = 'workspace-panel';
  const queueTitle = document.createElement('div');
  queueTitle.className = 'panel-title';
  queueTitle.textContent = 'Queue Summary';
  const queueSummary = document.createElement('div');
  queueSummary.className = 'queue-summary';
  queueCard.appendChild(queueTitle);
  queueCard.appendChild(queueSummary);

  const listCard = document.createElement('div');
  listCard.className = 'workspace-panel';
  const listTitle = document.createElement('div');
  listTitle.className = 'panel-title';
  listTitle.textContent = 'Highlights';
  const highlightList = document.createElement('div');
  highlightList.className = 'workspace-list';
  listCard.appendChild(listTitle);
  listCard.appendChild(highlightList);

  left.appendChild(sourceCard);
  left.appendChild(queueCard);
  left.appendChild(listCard);

  const editorCard = document.createElement('div');
  editorCard.className = 'workspace-panel';
  const editorTitle = document.createElement('div');
  editorTitle.className = 'panel-title';
  editorTitle.textContent = 'Focused Highlight Editor';
  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  const form = document.createElement('div');
  form.className = 'workspace-form';

  function makeField(labelText, inputEl) {
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = labelText;
    field.appendChild(label);
    field.appendChild(inputEl);
    return field;
  }

  function makeInput() {
    const input = document.createElement('input');
    input.className = 'input';
    return input;
  }

  function makeTextarea() {
    const textarea = document.createElement('textarea');
    textarea.className = 'textarea';
    return textarea;
  }

  function makeSelect(options) {
    const select = document.createElement('select');
    select.className = 'select';
    options.forEach((option) => {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    });
    return select;
  }

  function makeSwitch(text, checked) {
    const label = document.createElement('label');
    label.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    const slider = document.createElement('span');
    slider.className = 'slider';
    const span = document.createElement('span');
    span.className = 'switch-label';
    span.textContent = text;
    label.appendChild(input);
    label.appendChild(slider);
    label.appendChild(span);
    return { wrapper: label, input };
  }

  const titleInput = makeInput();
  const descriptionInput = makeTextarea();
  const hookInput = makeTextarea();
  const captionOverrideInput = makeTextarea();
  const trackingMode = makeSelect([
    { value: 'center_crop', label: 'Center Crop' },
    { value: 'podcast_smart', label: 'Podcast Smart' },
    { value: 'split_screen', label: 'Split Screen' },
    { value: 'sports_beta', label: 'Sports Beta' }
  ]);
  const captionMode = makeSelect([
    { value: 'auto', label: 'Auto' },
    { value: 'manual', label: 'Manual Override' }
  ]);
  const ttsVoice = makeInput();
  const watermarkPreset = makeInput();
  const addHook = makeSwitch('Add hook on render', true);
  const addCaptions = makeSwitch('Add captions on render', true);
  const sourceCredit = makeSwitch('Source credit enabled', true);

  form.appendChild(makeField('Title', titleInput));
  form.appendChild(makeField('Description', descriptionInput));
  form.appendChild(makeField('Hook Text', hookInput));
  form.appendChild(makeField('Caption Override', captionOverrideInput));
  form.appendChild(makeField('Tracking Mode', trackingMode));
  form.appendChild(makeField('Caption Mode', captionMode));
  form.appendChild(makeField('TTS Voice', ttsVoice));
  form.appendChild(makeField('Watermark Preset', watermarkPreset));
  form.appendChild(makeField('Render Options', addHook.wrapper));
  form.appendChild(makeField('Caption Render', addCaptions.wrapper));
  form.appendChild(makeField('Composition', sourceCredit.wrapper));

  editorCard.appendChild(editorTitle);
  editorCard.appendChild(hint);
  editorCard.appendChild(form);

  const outputCard = document.createElement('div');
  outputCard.className = 'workspace-panel';
  const outputTitle = document.createElement('div');
  outputTitle.className = 'panel-title';
  outputTitle.textContent = 'Rendered Outputs';
  const outputList = document.createElement('div');
  outputList.className = 'output-list';
  outputCard.appendChild(outputTitle);
  outputCard.appendChild(outputList);

  right.appendChild(editorCard);
  right.appendChild(outputCard);

  section.appendChild(top);
  section.appendChild(actionRow);
  section.appendChild(summary);
  section.appendChild(status);
  section.appendChild(shell);

  return {
    element: section,
    fields: {
      back,
      refresh,
      save,
      render,
      retry,
      outputs,
      status,
      sessionTitle,
      sessionMeta,
      provider,
      statusBadge,
      sourceRows,
      queueSummary,
      highlightList,
      hint,
      titleInput,
      descriptionInput,
      hookInput,
      captionOverrideInput,
      trackingMode,
      captionMode,
      ttsVoice,
      watermarkPreset,
      addHook: addHook.input,
      addCaptions: addCaptions.input,
      sourceCredit: sourceCredit.input,
      outputList
    }
  };
};
