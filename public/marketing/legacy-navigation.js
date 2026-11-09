(function () {
  'use strict';
  const key = 'clm-marketing-disclosure-v1';
  const legacyPages = new Set(['doingoai','truyenthong','anpham','hocbong','baocao','phoihop','tailieu','taikhoan']);
  let activePath = null;
  let legacyScroll = 0;
  const items = [
    ['/marketing','Marketing Overview','<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
    ['/marketing/campaigns','Campaigns','<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M8 11v5m4-5v3m4-3v6"/>'],
    ['/marketing/agent','AI Agent &amp; Ideas','<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>'],
    ['/marketing/studio','Creative Studio','<path d="m4 20 4-1L20 7l-3-3L5 16Zm11-14 3 3M4 20l1-4 3 3"/>'],
    ['/marketing/calendar','Content Calendar','<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18m-12 4h2m4 0h2"/>'],
    ['/marketing/assets','Asset &amp; Template Library','<rect x="5" y="3" width="16" height="16" rx="2"/><path d="M2 7v13a2 2 0 0 0 2 2h13M5 15l5-5 7 9m-3-6 3-3 4 4"/>'],
    ['/marketing/intelligence','Intelligence &amp; Reports','<path d="M3 3v18h18M7 15l4-5 4 3 5-7"/>'],
    ['/marketing/approvals','Approval Inbox','<path d="m2 12 5 5L17 7m-4 10 3 0 6-6"/>'],
  ];
  const svg = body => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
  function expanded() { try { return sessionStorage.getItem(key) === 'open'; } catch { return false; } }
  function setExpanded(value) { try { sessionStorage.setItem(key,value?'open':'closed'); } catch { /* Storage is optional. */ } }
  function sync() {
    const legacy = document.getElementById('cos-main');
    const outlet = document.getElementById('clm-marketing-content');
    if (!legacy || !outlet) return;
    legacy.hidden = Boolean(activePath);
    outlet.hidden = !activePath;
    document.querySelectorAll('#modal-root .modal-bg').forEach(layer => {
      layer.hidden = (layer.dataset.clmModule === 'marketing') !== Boolean(activePath);
    });
    document.querySelector('.cos-skip')?.setAttribute('href', activePath ? '#clm-marketing-content' : '#cos-main');
    const group = document.querySelector('.clm-marketing-disclosure');
    if (!group) return;
    const open = expanded() && !document.querySelector('.sidebar.collapsed:not(.mobile-open)');
    group.dataset.expanded = String(open);
    group.querySelector('button').setAttribute('aria-expanded',String(open));
    group.querySelector('button').classList.toggle('active',Boolean(activePath));
    group.querySelector('.clm-marketing-menu').inert = !open;
    group.querySelectorAll('.clm-marketing-link').forEach(link => {
      const path = link.getAttribute('href');
      const selected = activePath === path || (path !== '/marketing' && activePath?.startsWith(path+'/'));
      if (selected) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    if (activePath) document.querySelectorAll('.nav-item:not(.clm-marketing-toggle),.cos-top-nav button,.mobile-bottom-nav button[aria-current]').forEach(item => {
      item.classList.remove('active');
      item.setAttribute('aria-current','false');
    });
  }
  function setPath(path) {
    const previous = activePath;
    if (path && !previous) legacyScroll = window.scrollY;
    if (path && path !== previous) setExpanded(true);
    activePath = path;
    sync();
    if (path !== previous) {
      window.scrollTo(0,path ? 0 : legacyScroll);
      document.querySelector('#modal-root .modal-bg:not([hidden]) .modal')?.focus({preventScroll:true});
    }
  }
  function leave(page) {
    if (!activePath || window.parent === window) return;
    legacyScroll = 0;
    window.parent.postMessage({type:'clm-legacy-open',page:legacyPages.has(page)?page:null},window.location.origin);
  }
  function render() {
    const open=expanded();
    return '<div class="clm-marketing-disclosure" data-expanded="'+open+'"><button type="button" class="nav-item clm-marketing-toggle" aria-expanded="'+open+'" aria-controls="clm-marketing-children" title="Marketing" onclick="window.clmMarketingNavigation.toggle()">'+svg('<path d="m3 10 13-5v14L3 14Zm13-2 5-2v12l-5-2M6 15l2 6h4l-2-5"/>')+'<span>Marketing</span><b class="clm-marketing-chevron" aria-hidden="true">'+svg('<path d="m9 5 7 7-7 7"/>')+'</b></button><div id="clm-marketing-children" class="clm-marketing-menu"'+(open?'':' inert')+'><div>'+items.map(([href,label,icon])=>'<a class="clm-marketing-link" href="'+href+'" target="_top" onclick="return window.clmMarketingNavigation.open(event,this)">'+svg(icon)+'<span>'+label+'</span></a>').join('')+'</div></div></div>';
  }
  function toggle() {
    const collapsed=document.querySelector('.sidebar.collapsed');
    const root=document.querySelector('.clm-marketing-disclosure');
    const open=Boolean(collapsed)||root?.dataset.expanded!=='true';
    setExpanded(open);
    if(collapsed && typeof window.toggleSidebar==='function') { window.toggleSidebar(); return; }
    if(!root) return;
    root.dataset.expanded=String(open);
    root.querySelector('button').setAttribute('aria-expanded',String(open));
    root.querySelector('.clm-marketing-menu').inert=!open;
  }
  function open(event,anchor) {
    const path=anchor.getAttribute('href');
    if(!items.some(item=>item[0]===path)) return false;
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return true;
    event.preventDefault();
    setExpanded(true);
    window.clmCloseMobileNav?.();
    if(window.parent!==window) window.parent.postMessage({type:'clm-marketing-open',path,legacyPage:window.clmCurrentLegacyPage?.()},window.location.origin);
    else window.location.assign(path);
    return false;
  }
  window.clmMarketingNavigation=Object.freeze({render,toggle,open,sync,setPath,leave,active:()=>Boolean(activePath)});
}());
