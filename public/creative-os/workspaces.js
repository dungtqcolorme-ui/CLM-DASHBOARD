/* Presentation only: original renderers, nodes, values and inline handlers survive. */
(function(scope){
 'use strict';
 const routes={truyenthong:'media',anpham:'inventory',hocbong:'scholar',phoihop:'tasks'};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let lastRoute='',lastFilter='',values=new Map();
 function box(className,children=[]){const node=document.createElement('div');node.className=className;node.append(...children.filter(Boolean));return node;}
 function metricLabel(node){return node.querySelector('.cm-label,.metric-label')?.textContent.trim()||'';}
 function metrics(page,key){
  const cards=[...page.querySelectorAll('.compact-metric,.metric-card')];
  if(!cards.length)return null;
  const primary=key==='media'?(cards.find(c=>metricLabel(c)==='Tổng reach')||cards.find(c=>metricLabel(c)==='Bài On Air')||cards[0]):cards[0];
  primary.classList.add('cw-primary-metric');
  const supporting=box('cw-supporting-metrics',cards.filter(c=>c!==primary));
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
 function present(route,markup){
  const key=routes[route];if(!key)return markup;
  const template=document.createElement('template');template.innerHTML=markup;
  const page=template.content.firstElementChild;if(!page)return markup;
  page.classList.add('cos-workspace','cw-'+key);
  ({media,inventory,scholar,tasks})[key](page);
  [...page.children].forEach(child=>{child.style.removeProperty('margin-top');child.style.removeProperty('margin-bottom');});
  return template.innerHTML;
 }
 function afterRender(route){
  const root=document.querySelector('.cos-workspace'),key=routes[route];
  if(!root||!key){delete document.body.dataset.cosWorkspace;lastRoute='';lastFilter='';return;}
  document.body.dataset.cosWorkspace=key;
  const entered=lastRoute!==route;
  const filter=[...root.querySelectorAll('select,input')].map(n=>n.value).join('\u0001');
  const next=new Map();
  root.querySelectorAll('.compact-metric,.metric-card').forEach(card=>{
   const label=route+'\u0001'+metricLabel(card),value=card.querySelector('.cm-value,.metric-value');
   next.set(label,value?.textContent);
   if(!reduced.matches&&value&&values.has(label)&&values.get(label)!==value.textContent)value.animate([{opacity:.35},{opacity:1}],{duration:140,easing:'ease-out'});
  });
  if(!reduced.matches){
   if(entered)root.querySelectorAll('.cw-media-analytics,.cw-inventory-analytics,.cw-scholar-analytics').forEach(chart=>chart.animate([{opacity:.5,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.16,1,.3,1)'}));
   else if(filter!==lastFilter)root.querySelectorAll('.cw-data-panel tbody,.cw-calendar').forEach(table=>table.animate([{opacity:.6},{opacity:1}],{duration:140,easing:'ease-out'}));
  }
  values=next;lastRoute=route;lastFilter=filter;
 }
 function watchDialogs(){
  const host=document.getElementById('modal-root');if(!host)return;
  new MutationObserver(()=>{
   if(!document.body.dataset.cosWorkspace)return;
   host.querySelectorAll('.modal:not(.cw-workspace-dialog)').forEach(dialog=>dialog.classList.add('cw-workspace-dialog'));
  }).observe(host,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchDialogs,{once:true});else watchDialogs();
 scope.CLMWorkspaces={present,afterRender};
})(window);
