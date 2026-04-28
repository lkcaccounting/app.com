(function () {
  const css = `
    #pb-btn {
      position:fixed; bottom:22px; right:22px; z-index:99999;
      width:54px; height:54px; border-radius:50%;
      background:#141c2e; border:2px solid #22c55e;
      box-shadow:0 0 16px rgba(34,197,94,.3);
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      font-size:22px; transition:transform .2s,box-shadow .2s;
    }
    #pb-btn:hover{transform:scale(1.1);box-shadow:0 0 24px rgba(34,197,94,.5);}
    #pb-badge{
      position:absolute;top:-4px;right:-4px;
      background:#22c55e;color:#0a0e1a;
      border-radius:100px;font-size:9px;font-weight:700;
      padding:2px 5px;font-family:sans-serif;
    }
    #pb-panel{
      position:fixed;bottom:88px;right:16px;z-index:99998;
      width:min(500px,calc(100vw - 28px));
      height:min(700px,calc(100vh - 110px));
      border-radius:12px;overflow:hidden;
      box-shadow:0 20px 60px rgba(0,0,0,.6);
      border:1px solid #1e2d45;
      display:none;opacity:0;transform:translateY(10px) scale(.97);
      transition:opacity .2s,transform .2s;background:#0a0e1a;
    }
    #pb-panel.open{display:block;opacity:1;transform:translateY(0) scale(1);}
    #pb-panel iframe{width:100%;height:100%;border:none;}
    #pb-toast{
      display:none;position:fixed;bottom:88px;right:16px;z-index:99998;
      background:#dc2626;color:#fff;border-radius:10px;
      padding:14px 18px;font-family:sans-serif;font-size:13px;
      max-width:300px;box-shadow:0 8px 24px rgba(220,38,38,.4);
      animation:pb-up .3s ease;
    }
    #pb-toast strong{display:block;margin-bottom:4px;font-size:14px;}
    @keyframes pb-up{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
  `;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);

  // Button
  const btn = document.createElement('div'); btn.id = 'pb-btn';
  btn.innerHTML = '🤖<span id="pb-badge">AI</span>'; btn.title = 'ProBooks AI';
  document.body.appendChild(btn);

  // Panel
  const panel = document.createElement('div'); panel.id = 'pb-panel';
  const src = (document.currentScript?.src || '').replace('probooks-ai-widget.js','') + 'probooks-ai.html';
  // Pass API key from config if set
  const apiKey = window.PROBOOKS_API_KEY || '';
  panel.innerHTML = `<iframe src="${src}" id="pb-iframe" title="ProBooks AI"></iframe>`;
  document.body.appendChild(panel);

  // When iframe loads, pass API key
  panel.querySelector('iframe').addEventListener('load', function() {
    if (apiKey) {
      try { this.contentWindow.PROBOOKS_API_KEY = apiKey; } catch(e) {}
    }
  });

  // Toast
  const toast = document.createElement('div'); toast.id = 'pb-toast';
  toast.innerHTML = '<strong>📡 No Internet Connection</strong>ProBooks AI needs internet. Please connect and try again — your data is safe offline.';
  document.body.appendChild(toast);
  let toastT;
  function showToast() {
    toast.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toast.style.display = 'none'; }, 5000);
  }

  let open = false;
  btn.addEventListener('click', () => {
    if (!navigator.onLine) { showToast(); return; }
    open = !open;
    if (open) {
      panel.classList.add('open');
      btn.innerHTML = '✕<span id="pb-badge">AI</span>';
      btn.style.background = '#22c55e'; btn.style.color = '#0a0e1a';
    } else {
      panel.classList.remove('open');
      btn.innerHTML = '🤖<span id="pb-badge">AI</span>';
      btn.style.background = '#141c2e'; btn.style.color = '';
    }
  });

  document.addEventListener('click', e => {
    if (open && !panel.contains(e.target) && !btn.contains(e.target)) {
      open = false; panel.classList.remove('open');
      btn.innerHTML = '🤖<span id="pb-badge">AI</span>';
      btn.style.background = '#141c2e'; btn.style.color = '';
    }
  });

  window.addEventListener('offline', () => {
    if (open) { open = false; panel.classList.remove('open'); }
    btn.style.opacity = '.5'; btn.title = 'ProBooks AI (connect to internet to use)';
  });
  window.addEventListener('online', () => {
    btn.style.opacity = '1'; btn.title = 'ProBooks AI';
  });
  if (!navigator.onLine) btn.style.opacity = '.5';
})();
