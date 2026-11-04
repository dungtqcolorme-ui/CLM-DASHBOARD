/* Presentation only: original renderers, nodes, values and inline handlers survive. */
(function(scope){
 'use strict';
 const routes={truyenthong:'media',anpham:'inventory',hocbong:'scholar',phoihop:'tasks'};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderedRoot=null,lastRoute='',lastFilter='',values=new Map(),chartValues=new Map(),positions=new Map(),viewport=0;
 const active=new Set();
 let motionRequest=null;
 function ensureMotion(){
  if(scope.Motion?.animate)return Promise.resolve(true);
  if(motionRequest)return motionRequest;
  motionRequest=new Promise(resolve=>{
   const script=document.createElement('script');script.src='/creative-os/vendor/motion-14.9.0.js';script.async=true;
   script.onload=()=>resolve(Boolean(scope.Motion?.animate));
   script.onerror=()=>{motionRequest=null;resolve(false);};document.head.append(script);
  });return motionRequest;
 }
 let lastTaskView='',taskRecords=new Map();
 function box(className,children=[]){const node=document.createElement('div');node.className=className;node.append(...children.filter(Boolean));return node;}
 function metricLabel(node){return node.querySelector('.cm-label,.metric-label')?.textContent.trim()||'';}
 function metrics(page,key){
  const cards=[...page.querySelectorAll('.compact-metric,.metric-card')];
  if(!cards.length)return null;
  const primary=key==='media'?(cards.find(c=>metricLabel(c)==='Tổng reach')||cards.find(c=>metricLabel(c)==='Bài On Air')||cards[0]):cards[0];
  primary.classList.add('cw-primary-metric');
  const featured={media:['Bài On Air','Hoàn thành kế hoạch'],inventory:['Ngân sách còn lại'],scholar:['Đã dùng'],tasks:['Đang thực hiện']}[key];
  cards.filter(card=>card!==primary&&featured.includes(metricLabel(card))).forEach(card=>card.classList.add('cw-secondary-metric'));
  cards.forEach(card=>{
   const icon=card.querySelector('.kpi-ic,.metric-icon');if(!icon)return;icon.setAttribute('aria-hidden','true');
   const svg=icon.querySelector('svg');
   if(svg&&!svg.childElementCount){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M21 12a9 9 0 1 1-9-9v9z M15 3.5A9 9 0 0 1 20.5 9H15z');svg.append(path);}
  });
  const supportingCards=cards.filter(c=>c!==primary);
  const supporting=box('cw-supporting-metrics',[...supportingCards.filter(c=>c.classList.contains('cw-secondary-metric')),...supportingCards.filter(c=>!c.classList.contains('cw-secondary-metric'))]);
  supporting.style.setProperty('--cw-metric-columns',String(Math.min(3,supporting.children.length)));
  return box('cw-metric-region',[primary,supporting]);
 }
 function panelClass(panel,name){if(panel){panel.classList.add(name);panel.style.removeProperty('margin-top');panel.style.removeProperty('margin-bottom');}return panel;}
 function media(page){
  const metricRow=page.querySelector('.metric-row'),summary=metrics(page,'media');
  if(summary)metricRow.replaceWith(summary);
  const status=page.querySelector('.media-status-grid'),trend=page.querySelector('.media-trend-panel');
  const charts=[...(status?.children||[])];charts.forEach(p=>p.classList.add('cw-distribution'));
  if(charts.length||trend){const analytics=box('cw-media-analytics',[...charts,panelClass(trend,'cw-trend')]);(status||page.querySelector('.media-compact-grid')).before(analytics);status?.remove();}
  const split=page.querySelector('.media-compact-grid');
  if(split){split.replaceWith(...split.children);}
  page.querySelectorAll('.dash-panel:has(table)').forEach(p=>p.classList.add('cw-data-panel'));
 }
 function inventory(page){
  const rows=[...page.querySelectorAll(':scope > .compact-metrics')],summary=metrics(page,'inventory');
  if(summary){rows[0].before(summary);rows.forEach(row=>row.remove());}
  const charts=page.querySelector('.compact-chart-row');
  if(charts){charts.classList.add('cw-inventory-analytics');charts.children[0]?.classList.add('cw-stock-chart');charts.children[1]?.classList.add('cw-cost-chart');}
  const bars=page.querySelector('.mini-bars');if(bars)bars.style.setProperty('--cw-items',String(bars.children.length));
  page.querySelectorAll('.compact-table').forEach(p=>p.classList.add('cw-data-panel'));
 }
 function scholar(page){
  const row=page.querySelector(':scope > .compact-metrics'),summary=metrics(page,'scholar');
  if(summary)row.replaceWith(summary);
  const charts=page.querySelector('.compact-chart-row');
  if(charts){charts.classList.add('cw-scholar-analytics');charts.children[0]?.classList.add('cw-distribution');charts.children[1]?.classList.add('cw-tier-panel');}
  const list=[...page.querySelectorAll('.compact-table')].find(p=>p.querySelector('.scholar-list-search'));
  list?.classList.add('cw-data-panel');
 }
 function tasks(page){
  const row=page.querySelector(':scope > .compact-metrics'),summary=metrics(page,'tasks');
  if(summary)row.replaceWith(summary);
  const toolbar=page.querySelector('.hub-toolbar');
  if(toolbar){
   toolbar.closest('.card')?.classList.add('cw-toolbar-panel');
   const names=['Loại công việc','Trạng thái','Nhân sự','Deadline','Ca làm việc'];
   [...toolbar.querySelectorAll(':scope > select')].forEach((select,index)=>{
    const label=document.createElement('label');label.className='cw-filter-field';
    const caption=document.createElement('span');caption.textContent=names[index];
    select.before(label);label.append(caption,select);
   });
  }
  const calendar=page.querySelector('.hub-week,.hub-month');
  if(calendar){const scroll=box('cw-calendar');calendar.before(scroll);scroll.append(calendar);}
  page.querySelector('.hub-list-card')?.classList.add('cw-data-panel');
 }
 // Recolor original marks and legends together; never reconstruct chart values.
 function styleCharts(page){
  const palette={'#e11b22':'#be735c','#2563eb':'#4d4a44','#16a34a':'#738a69','#534ab7':'#93899d','#98a2b3':'#9b9183','#e4e7ec':'#9b9183','#f1efed':'#eeebe5'};
  const color=value=>palette[String(value).toLowerCase()]||value;
  page.querySelectorAll('.cw-media-analytics>.dash-panel,.cw-inventory-analytics>.dash-panel,.cw-scholar-analytics>.cw-distribution').forEach(panel=>{
   panel.classList.add('cw-chart-panel');
   panel.querySelectorAll('svg').forEach(svg=>{
    svg.classList.add('cw-chart-svg');
    if(svg.querySelector('circle[stroke-dasharray]'))svg.classList.add('cw-donut');
    svg.querySelectorAll('[stroke],[fill]').forEach(mark=>{for(const attribute of ['stroke','fill'])if(mark.hasAttribute(attribute))mark.setAttribute(attribute,color(mark.getAttribute(attribute)));});
    svg.querySelectorAll('title').forEach(title=>{title.parentElement.dataset.cwTip=title.textContent;});
    if(panel.classList.contains('cw-cost-chart'))svg.querySelectorAll('text').forEach(text=>{
     if(text.getAttribute('font-size')!=='11.5'||text.hasAttribute('font-weight')||text.textContent.length<=12)return;
     const words=text.textContent.split(' '),lines=[''];words.forEach(word=>{const i=lines.length-1;if(lines[i]&&lines[i].length+word.length>11)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;});
     text.replaceChildren(...lines.map((line,index)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x',text.getAttribute('x'));span.setAttribute('dy',index?'16':'0');span.textContent=line+(index<lines.length-1?' ':'');return span;}));
    });
   });
   panel.querySelectorAll('.mini-bar,.legend-dot,.status-row>span').forEach(mark=>{
    const match=mark.getAttribute('style')?.match(/background:\s*(#[a-f0-9]{6})/i);if(match)mark.style.background=color(match[1]);
    if(mark.hasAttribute('title'))mark.dataset.cwTip=mark.getAttribute('title');
   });
  });
  page.querySelectorAll('.tbl').forEach(table=>{
   table.classList.add('cw-table');table.closest('.tbl-wrap')?.classList.add('cw-table-scroll');
  });
 }
 function finishAnimations(){
  active.forEach(({control,node})=>{control.cancel();node.style.removeProperty('opacity');node.style.removeProperty('transform');});active.clear();
 }
 function motion(node,keyframes,options={}){
  if(reduced.matches||!node?.isConnected)return;
  if(!scope.Motion?.animate)return;
  const control=scope.Motion.animate(node,keyframes,{duration:.22,ease:[.16,1,.3,1],...options});
  const item={control,node};active.add(item);
  Promise.resolve(control).then(()=>{active.delete(item);node.style.removeProperty('opacity');node.style.removeProperty('transform');}).catch(()=>active.delete(item));
 }
 function chartSignature(panel){
  return [...panel.querySelectorAll('svg title,svg text,circle[stroke-dasharray],.mini-bar')].map(node=>node.getAttribute('stroke-dasharray')||node.getAttribute('title')||node.textContent).join('\u0001');
 }
 function present(route,markup){
  const key=routes[route];if(!key)return markup;
  const template=document.createElement('template');template.innerHTML=markup;
  const page=template.content.firstElementChild;if(!page)return markup;
  page.classList.add('cos-workspace','cw-'+key);
  ({media,inventory,scholar,tasks})[key](page);
  styleCharts(page);
  [...page.children].forEach(child=>{child.style.removeProperty('margin-top');child.style.removeProperty('margin-bottom');});
  return template.innerHTML;
 }
 function afterRender(route){
  const root=document.querySelector('.cos-workspace'),key=routes[route];
  if(root&&root===renderedRoot&&key)return;
  renderedRoot=root;finishAnimations();hideTooltip();
  if(!root||!key){delete document.body.dataset.cosWorkspace;lastRoute='';lastFilter='';chartValues.clear();positions.clear();lastTaskView='';taskRecords.clear();return;}
  document.body.dataset.cosWorkspace=key;
  if(!reduced.matches&&!scope.Motion?.animate)ensureMotion().then(loaded=>{
   if(loaded&&root.isConnected&&document.querySelector('.cos-workspace')===root&&!reduced.matches){renderedRoot=null;lastRoute='';afterRender(route);}
  });
  const entered=lastRoute!==route,filter=[...root.querySelectorAll('select,input')].map(n=>n.value).join('\u0001');
  const next=new Map(),nextCharts=new Map(),nextPositions=new Map();
  root.querySelectorAll('.compact-metric,.metric-card').forEach((card,index)=>{
   const label=route+'\u0001'+metricLabel(card),value=card.querySelector('.cm-value,.metric-value');
   next.set(label,value?.textContent);
   if(entered)motion(card,{opacity:[.5,1],transform:['translateY(8px)','none']},{delay:Math.min(index*.025,.15),duration:.3});
   else if(value&&values.has(label)&&values.get(label)!==value.textContent)motion(value,{opacity:[.35,1]},{duration:.18});
  });
  root.querySelectorAll('.cw-chart-panel').forEach((panel,index)=>{
   const id=route+'\u0001'+panel.querySelector('h3')?.textContent,signature=chartSignature(panel);nextCharts.set(id,signature);
   if(entered||chartValues.get(id)!==signature){
    const targets=[...panel.querySelectorAll('.cw-chart-svg,.mini-bar')];
    targets.forEach((node,i)=>motion(node,{opacity:[.3,1],transform:['translateY(5px)','none']},{duration:.32,delay:Math.min(i*.008,.16)}));
   }
   if(entered)motion(panel,{opacity:[.6,1]},{duration:.24,delay:index*.025});
  });
  root.querySelectorAll('.cw-data-panel,.cw-calendar,.cw-toolbar-panel,.media-filter-compact,.scholar-toolbar,.meeting-hub-section').forEach((panel,index)=>{
   const id=panel.querySelector('h3')?.textContent||panel.className,rect=panel.getBoundingClientRect(),top=rect.top+scrollY,previous=positions.get(id);
   nextPositions.set(id,top);
   if(entered)motion(panel,{opacity:[.5,1],transform:['translateY(7px)','none']},{duration:.26,delay:Math.min(index*.025,.1)});
   else if(filter!==lastFilter){
    const delta=viewport===innerWidth&&previous!=null?Math.max(-40,Math.min(40,previous-top)):0;
    motion(panel,{opacity:[.65,1],transform:[`translateY(${delta}px)`,'none']},{duration:.2});
   }
  });
  if(key==='tasks'){
   const calendar=root.querySelector('.hub-week,.hub-month'),panel=root.querySelector('.cw-calendar,.hub-list-card');
   const view=calendar?calendar.className+'|'+[...calendar.querySelectorAll('[data-date]')].map(day=>day.dataset.date).join('|'):'list';
   const changedView=!entered&&lastTaskView!==view,records=new Map();
   if(changedView)motion(panel,{opacity:[.45,1],transform:['translateY(5px)','none']},{duration:.22});
   root.querySelectorAll('.hub-task-card[data-record-id],tr[data-record-id]').forEach(card=>{
    const id=card.dataset.recordId,text=card.textContent;records.set(id,text);
    if(!entered&&!changedView&&taskRecords.has(id)&&taskRecords.get(id)!==text)motion(card,{opacity:[.4,1]},{duration:.24});
   });lastTaskView=view;taskRecords=records;
  }else{lastTaskView='';taskRecords.clear();}
  values=next;chartValues=nextCharts;positions=nextPositions;viewport=innerWidth;lastRoute=route;lastFilter=filter;
 }
 let tooltip=null;
 function hideTooltip(){tooltip?.remove();tooltip=null;}
 function showTooltip(event){
  const target=event.target.closest?.('[data-cw-tip]');if(!target||!target.closest('.cos-workspace'))return;
  if(!tooltip){tooltip=document.createElement('div');tooltip.className='cw-chart-tooltip';tooltip.setAttribute('role','tooltip');target.closest('.cos-workspace').append(tooltip);}
  tooltip.textContent=target.dataset.cwTip;
  tooltip.style.left=Math.max(8,Math.min(event.clientX+14,innerWidth-264))+'px';tooltip.style.top=Math.max(8,Math.min(event.clientY+16,innerHeight-80))+'px';
  motion(tooltip,{opacity:[0,1]},{duration:.12});
 }
 document.addEventListener('pointerover',showTooltip);
 document.addEventListener('pointerout',event=>{if(event.target.closest?.('[data-cw-tip]')&&!event.relatedTarget?.closest?.('[data-cw-tip]'))hideTooltip();});
 document.addEventListener('scroll',hideTooltip,{capture:true,passive:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip();});
 reduced.addEventListener('change',()=>{if(reduced.matches){finishAnimations();hideTooltip();}});
 function watchDialogs(){
  const host=document.getElementById('modal-root');if(!host)return;
  new MutationObserver(()=>{
   if(!document.body.dataset.cosWorkspace)return;
   host.querySelectorAll('.modal:not(.cw-workspace-dialog)').forEach(dialog=>{dialog.classList.add('cw-workspace-dialog');motion(dialog,{opacity:[.3,1],transform:['translateY(8px)','none']},{duration:.18});});
  }).observe(host,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchDialogs,{once:true});else watchDialogs();
 scope.CLMWorkspaces={present,afterRender};
})(window);
