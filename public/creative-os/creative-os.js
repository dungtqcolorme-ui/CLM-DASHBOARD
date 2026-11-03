/* Presentation adapter for the private vanilla dashboard. No business data writes. */
(function (scope) {
  'use strict';
  if (!scope.CLMMascot) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const controller = new scope.CLMMascot.MascotController({reducedMotion: reduced.matches});
  let lastRoute = '', pendingFocus = '', focusedHeading = null, routeAnimation = null, pointerFrame = 0, slot = null, companion = null;
  let inView = true, destroyed = false, vector = '', vectorRequest = null;
  const assetUrl = '/creative-os/coloro.svg';
  function paintState(state) {
    if (!companion?.isConnected) return;
    companion.dataset.state = state.state;
    companion.dataset.presence = String(state.presence);
    /* PDF coordinates are roughly 16x the displayed vector coordinates. */
    companion.style.setProperty('--cos-look-x', `${state.look.x * 16}px`);
    companion.style.setProperty('--cos-look-y', `${-state.look.y * 16}px`);
  }
  const unsubscribe = controller.subscribe(paintState);
  const observer = new IntersectionObserver(entries => {
    const current = entries.find(entry => entry.target === companion);
    if (current) {inView = current.isIntersecting; syncPresence();}
  });
  function syncPresence() {
    if (!companion?.isConnected) {controller.setPresence(0); return;}
    const focused = Boolean(document.querySelector('#modal-root .modal-bg')) ||
      Boolean(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'));
    const paused = document.hidden || !inView || reduced.matches;
    companion.dataset.paused = String(paused);
    controller.setPresence(focused || document.hidden || !inView ? 0 : 1);
  }
  function loadVector() {
    if (vector) return Promise.resolve(vector);
    if (!vectorRequest) vectorRequest = fetch(assetUrl, {credentials:'same-origin'})
      .then(response => {if (!response.ok) throw new Error('Mascot asset unavailable'); return response.text();})
      .then(text => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        if (doc.documentElement.tagName !== 'svg' || doc.querySelector('script,foreignObject')) throw new Error('Invalid mascot vector');
        vector = text; return text;
      }).catch(() => {vectorRequest = null; return '';});
    return vectorRequest;
  }
  function mountMascot(sourceState) {
    observer.disconnect();
    companion = document.querySelector('.cos-companion');
    slot = companion?.querySelector('.cos-mascot') || null;
    if (!slot) {controller.setPresence(0); return;}
    inView = true; observer.observe(companion); syncPresence();
    paintState(controller);
    if (controller.state === 'IDLE') {
      if (sourceState === 'error') controller.dispatch('ERROR');
      else if (sourceState === 'loading') controller.dispatch('DATA_LOADING');
      else if (document.querySelector('.cos-empty-note')) controller.dispatch('NO_RESULTS');
    }
    const target = slot;
    loadVector().then(svg => {
      if (!destroyed && svg && target.isConnected) {target.innerHTML = svg; syncPresence();}
    });
  }
  function overview(markup, options = {}) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    const page = template.content.querySelector('.app-page');
    const intro = page?.querySelector('.page-hero');
    const metrics = [...(page?.querySelectorAll('.compact-metric') || [])];
    const panels = [...(page?.querySelectorAll('.compact-chart-row > .dash-panel') || [])];
    const heat = page?.querySelector('.heatmap-panel');
    const health = page?.querySelector('.sheet-health')?.parentElement;
    if (!page || !intro || metrics.length !== 5 || panels.length !== 2 || !heat || !health) return markup;
    page.className = 'app-page cos-overview cos-reference';
    const title = intro.querySelector('h2');
    if (title) title.innerHTML = 'Tổng quan đối ngoại<span class="cos-title-dot">.</span>';
    const eyebrow = intro.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'COLORME / CREATIVE OS';
    if (options.canWork) intro.querySelector('.page-actions')?.insertAdjacentHTML('beforeend','<button class="btn btn-primary" onclick="go(\'phoihop\')">Vào công việc <span aria-hidden="true">↗</span></button>');
    const grid = document.createElement('div'); grid.className = 'cos-modular-grid';
    grid.innerHTML = '<section class="cos-summary cos-panel" aria-label="Tổng quan hồ sơ"><div class="cos-panel-label">Toàn cảnh đối ngoại<span class="cos-panel-index">01 / OVERVIEW</span></div><div class="cos-summary-feature"></div><div class="cos-mini-metrics"></div></section>' +
      '<section class="cos-primary" aria-label="Không gian hiệu suất"><div class="cos-primary-head"><div><span class="cos-primary-eyebrow">CREATIVE CONNECTIONS</span><h3>Không gian kết nối.</h3><p>Từ mỗi cơ hội, đến một dấu ấn.</p></div><div class="cos-companion" aria-hidden="true" data-state="IDLE" data-presence="1"><span class="cos-mascot"><img src="/creative-os/coloro.svg" width="78" height="74" alt=""></span><small>COLORO / STUDIO MATE</small></div></div><div class="cos-studio-art" aria-hidden="true"></div><div class="cos-output-spotlight"></div><div class="cos-primary-bottom"><div class="cos-heat-slot"></div><div class="cos-conversion-slot"></div></div><span class="cos-canvas-credit" aria-hidden="true">ColorME — Make your mark.</span></section>' +
      '<section class="cos-status-slot" aria-label="Trạng thái hồ sơ"></section><section class="cos-source cos-panel"><div class="cos-panel-label">Nguồn dữ liệu<span class="cos-source-mark">SHEET / SYNC</span></div><div class="cos-health-slot"></div><p>Số liệu theo bộ lọc hiện tại.<br>Nguồn và công thức đối soát được giữ nguyên.</p></section>';
    grid.querySelector('.cos-summary-feature').append(metrics[0]);
    grid.querySelector('.cos-mini-metrics').append(...metrics.slice(1,4));
    grid.querySelector('.cos-output-spotlight').append(metrics[4]);
    panels[0].classList.add('cos-status','cos-panel');
    panels[1].classList.add('cos-conversion');
    grid.querySelector('.cos-status-slot').append(panels[0]);
    grid.querySelector('.cos-heat-slot').append(heat);
    grid.querySelector('.cos-conversion-slot').append(panels[1]);
    grid.querySelector('.cos-health-slot').append(health);
    // Move original controls, values, legends and notes. No calculation is reconstructed.
    for (const panel of [panels[0],panels[1],heat]) {
      const note = panel.querySelector('.formula-note');
      if (note) {
        const disclosure = document.createElement('details'); disclosure.className='cos-formula';
        const summary = document.createElement('summary'); summary.textContent='Cách tính & đối soát';
        disclosure.append(summary,note); panel.append(disclosure);
      }
    }
    modernCharts(panels[0],panels[1],heat);
    const footer = document.createElement('footer');footer.className='cos-footer';
    const date = new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    footer.innerHTML=`<span>${date} · Giờ Việt Nam</span><span>MADE FOR CREATIVE PEOPLE / COLORME</span>`;
    page.replaceChildren(intro);
    if (options.empty) {
      const empty = document.createElement('div');empty.className='cos-empty-note';empty.setAttribute('role','status');
      empty.innerHTML='<span aria-hidden="true">◇</span><span><b>Chưa có hồ sơ trong góc nhìn này.</b> Chọn khóa khác hoặc làm mới nguồn dữ liệu để tiếp tục.</span>';
      page.append(empty);
    }
    page.append(grid,footer);
    return template.innerHTML;
  }
  function modernCharts(statusPanel, conversionPanel, heatPanel) {
    const rows = [...statusPanel.querySelectorAll('.status-row')];
    const counts = rows.map(row=>Math.max(0,Number(row.querySelector('strong')?.textContent.replace(/[^\d-]/g,''))||0));
    const total = counts.reduce((sum,value)=>sum+value,0);
    const colors=rows.map(row=>{
      const label=row.querySelector('b')?.textContent||'';
      return label.includes('đã ký')?'var(--cos-chart-success)':label.includes('Đang')?'var(--cos-chart-active)':'var(--cos-chart-muted)';
    });
    let offset=0;
    const arcs=counts.map((count,index)=>{
      const length=total?count/total*100:0;
      const visibleLength=Math.max(length*.9,length-1.5);
      const dot=rows[index].querySelector('span');
      if(dot)dot.style.background=colors[index%colors.length];
      const arc=`<circle cx="80" cy="80" r="62" pathLength="100" stroke="${colors[index%colors.length]}" stroke-dasharray="${visibleLength} ${100-visibleLength}" stroke-dashoffset="${-offset}"/>`;
      offset+=length;return arc;
    }).join('');
    const oldChart=statusPanel.querySelector('.dash-panel-body > svg');
    if(oldChart && total)oldChart.outerHTML=`<svg class="cos-status-chart" viewBox="0 0 160 160" width="140" height="140" role="img" aria-label="Phân bổ ${total} hồ sơ"><g fill="none" stroke-width="13" transform="rotate(-90 80 80)"><circle cx="80" cy="80" r="62" stroke="var(--cos-subtle)"/>${arcs}</g><text x="80" y="78" text-anchor="middle" class="cos-chart-value">${new Intl.NumberFormat('vi-VN').format(total)}</text><text x="80" y="99" text-anchor="middle" class="cos-chart-caption">hồ sơ</text></svg>`;
    else if(oldChart)oldChart.remove();
    const ring=conversionPanel.querySelector('.ring');
    if(ring){
      const pct=Math.max(0,Math.min(100,Number(ring.querySelector('b')?.textContent.replace('%',''))||0));
      ring.insertAdjacentHTML('afterbegin',`<svg class="cos-gauge" viewBox="0 0 250 145" aria-hidden="true"><path d="M20 125 A105 105 0 0 1 230 125" pathLength="100" class="cos-gauge-track"/><path d="M20 125 A105 105 0 0 1 230 125" pathLength="100" stroke-dasharray="${pct} 100" class="cos-gauge-value"/></svg>`);
    }
    const cells=[...heatPanel.querySelectorAll('.heat td')];
    const values=cells.map(cell=>Math.max(0,Number(cell.textContent.replace(/[^\d-]/g,''))||0));
    const max=Math.max(1,...values);
    cells.forEach((cell,index)=>{
      const intensity=values[index]?Math.max(1,Math.ceil(values[index]/max*4)):0;
      cell.style.background=`var(--cos-heat-${intensity})`;
      cell.style.color=intensity>=3?'var(--cos-ink)':'var(--cos-on-dark)';
    });
    const stops=[...heatPanel.querySelectorAll('.heat-legend .sc i')];
    stops.forEach((stop,index)=>{stop.style.background=`var(--cos-heat-${Math.round(index/Math.max(1,stops.length-1)*4)})`;});
  }
  function skeleton() {
    return '<div class="cos-overview cos-skeleton" role="status" aria-label="Đang tải tổng quan" aria-busy="true"><span class="cos-sk cos-sk-title"></span><div class="cos-sk-layout"><div class="cos-sk-support"><span class="cos-sk"></span><span class="cos-sk"></span><span class="cos-sk"></span></div><span class="cos-sk cos-sk-primary"></span></div><span>Đang tải tổng quan…</span></div>';
  }
  function afterRender(page, options = {}) {
    if (destroyed) return;
    const root = document.querySelector('#app'); if (!root) return;
    root.classList.add('cos-shell');
    const subtitle = root.querySelector('.sidebar-head .name small');
    if (subtitle) subtitle.textContent = 'CREATIVE OS';
    root.querySelectorAll('.cos-top-nav button').forEach(button=>{
      const selected=button.dataset.page===page||(page==='chitiet'&&button.dataset.page==='doingoai');
      button.classList.toggle('active',selected);button.setAttribute('aria-current',selected?'page':'false');
    });
    root.querySelectorAll('.nav .nav-item').forEach(button=>button.setAttribute('aria-label',button.title));
    root.querySelectorAll('.mobile-bottom-nav button[onclick^="go("]').forEach(button => {
      const selected = button.getAttribute('onclick') === `go('${page}')`;
      button.classList.toggle('active', selected); button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    root.querySelectorAll('.menu-toggle').forEach(button => button.setAttribute('aria-expanded', String(Boolean(root.querySelector('.sidebar.mobile-open')))));
    root.querySelectorAll('.cos-overview .cm-value').forEach(value => value.classList.toggle('cos-value-text', value.textContent.length > 12));
    /* The legacy empty donut normalizes its denominator to 1. Hide that chart
       when there are no records; retain the actual surrounding empty feedback. */
    if (root.querySelector('.cos-empty-note')) {
      const chart = root.querySelector('.cos-overview .compact-chart-row .dash-panel-body > svg');
      if (chart) {chart.setAttribute('aria-hidden','true'); chart.style.display='none';}
    }
    const changed = lastRoute && lastRoute !== page;
    if (changed) {
      pendingFocus = page;
      routeAnimation?.cancel();
      const content = root.querySelector('.content');
      if (!reduced.matches && content) {
        const motion=getComputedStyle(root);
        const duration=parseFloat(motion.getPropertyValue('--cos-normal'))||220;
        const easing=motion.getPropertyValue('--cos-enter').trim()||'cubic-bezier(.16,1,.3,1)';
        routeAnimation=content.animate([{opacity:.45,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration,easing});
      }
    }
    const restoreHeading = focusedHeading && !focusedHeading.isConnected && document.activeElement === document.body;
    if (pendingFocus === page || restoreHeading) {
      const heading = root.querySelector('.content h1,.content h2');
      if (heading) {heading.tabIndex = -1; heading.focus({preventScroll:true}); focusedHeading = heading; pendingFocus = '';}
    }
    lastRoute = page;
    mountMascot(options.sourceState);
  }
  function pointer(event) {
    if (pointerFrame || !finePointer.matches || reduced.matches || !controller.presence || document.hidden || !inView || !slot?.isConnected) return;
    const x = event.clientX, y = event.clientY;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!slot?.isConnected || !controller.presence) return;
      const rect = slot.getBoundingClientRect();
      controller.lookAt((x - rect.left - rect.width/2)/160, (y - rect.top - rect.height/2)/160);
    });
  }
  function preference() {
    controller.reducedMotion = reduced.matches;
    if (reduced.matches) {
      routeAnimation?.cancel(); controller.look = {x:0,y:0}; controller.emit();
      if (pointerFrame) {cancelAnimationFrame(pointerFrame); pointerFrame=0;}
    }
    syncPresence();
  }
  function feedback(type) {syncPresence(); controller.dispatch(type === 'error' ? 'ERROR' : type === 'success' ? 'ACTION_SUCCESS' : type === 'warn' ? 'DEADLINE_APPROACHING' : 'NO_RESULTS');}
  function sync(state) {syncPresence(); controller.dispatch(state === 'loading' ? 'DATA_LOADING' : state === 'error' ? 'ERROR' : 'DATA_READY');}
  function focusChanged(event) {
    if (event.type === 'focusin') focusedHeading = event.target.matches('.content h1,.content h2') ? event.target : null;
    queueMicrotask(syncPresence);
  }
  const modalObserver = new MutationObserver(syncPresence);
  function setup() {const host = document.getElementById('modal-root'); if (host) modalObserver.observe(host,{childList:true});}
  function destroy() {
    destroyed = true; observer.disconnect(); modalObserver.disconnect(); unsubscribe(); controller.destroy(); routeAnimation?.cancel();
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    document.removeEventListener('pointermove',pointer);
    document.removeEventListener('focusin',focusChanged); document.removeEventListener('focusout',focusChanged);
    document.removeEventListener('visibilitychange',syncPresence); reduced.removeEventListener('change',preference);
  }
  document.addEventListener('pointermove',pointer,{passive:true});
  document.addEventListener('focusin',focusChanged); document.addEventListener('focusout',focusChanged);
  document.addEventListener('visibilitychange',syncPresence); reduced.addEventListener('change',preference);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true}); else setup();
  scope.addEventListener('pagehide',event => {if (!event.persisted) destroy();});
  scope.CLMCreativeOS = Object.freeze({overview,skeleton,afterRender,feedback,sync,controller,destroy});
})(window);
