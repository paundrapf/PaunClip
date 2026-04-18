window.Components = window.Components || {};

window.Components.Header = function () {
  const header = document.createElement('header');
  header.className = 'header';

  const brand = document.createElement('div');
  brand.className = 'brand';

  const icon = document.createElement('img');
  icon.className = 'brand-icon';
  icon.alt = 'icon';

  const brandText = document.createElement('div');
  brandText.className = 'brand-text';

  const title = document.createElement('div');
  title.className = 'brand-title';
  title.textContent = 'PaunClip';

  const sub = document.createElement('div');
  sub.className = 'brand-sub';
  sub.textContent = 'Personal clip engine, campaign queue, and workspace toolkit';

  brandText.appendChild(title);
  brandText.appendChild(sub);

  brand.appendChild(icon);
  brand.appendChild(brandText);

  const nav = document.createElement('div');
  nav.className = 'nav';

  const homeBtn = document.createElement('button');
  homeBtn.className = 'nav-btn';
  homeBtn.dataset.view = 'home';
  homeBtn.textContent = 'Home';

  const campaignsBtn = document.createElement('button');
  campaignsBtn.className = 'nav-btn';
  campaignsBtn.dataset.view = 'campaigns';
  campaignsBtn.textContent = 'Campaigns';

  const sessionsBtn = document.createElement('button');
  sessionsBtn.className = 'nav-btn';
  sessionsBtn.dataset.view = 'sessions';
  sessionsBtn.textContent = 'Sessions';

  const outputsBtn = document.createElement('button');
  outputsBtn.className = 'nav-btn';
  outputsBtn.dataset.view = 'outputs';
  outputsBtn.textContent = 'Outputs';

  const aiBtn = document.createElement('button');
  aiBtn.className = 'nav-btn';
  aiBtn.dataset.view = 'ai-settings';
  aiBtn.textContent = 'AI Settings';

  nav.appendChild(homeBtn);
  nav.appendChild(campaignsBtn);
  nav.appendChild(sessionsBtn);
  nav.appendChild(outputsBtn);
  nav.appendChild(aiBtn);

  header.appendChild(brand);
  header.appendChild(nav);

  return { element: header, icon, buttons: [homeBtn, campaignsBtn, sessionsBtn, outputsBtn, aiBtn] };
};
