import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function navigation() {
  const values=new Map(); const posts=[];
  const attrs={};const panel={inert:true};const button={setAttribute:(name,value)=>attrs[name]=value};
  const root={dataset:{expanded:'false'},querySelector:selector=>selector==='button'?button:panel};
  const window={parent:{postMessage:(...args)=>posts.push(args)},location:{origin:'https://clm.example'}};
  vm.runInNewContext(readFileSync(new URL('../public/marketing/legacy-navigation.js',import.meta.url),'utf8'),{window,document:{querySelector:selector=>selector==='.clm-marketing-disclosure'?root:null},sessionStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
  return {nav:window.clmMarketingNavigation,values,posts,root,attrs,panel};
}
test('Legacy Marketing disclosure renders exactly eight links and toggle preserves the dashboard',()=>{
  const f=navigation();const html=f.nav.render();
  assert.equal((html.match(/class="clm-marketing-link"/g)??[]).length,8);
  assert.match(html,/aria-expanded="false"/);assert.match(html,/inert/);
  f.nav.toggle();assert.equal(f.attrs['aria-expanded'],'true');assert.equal(f.panel.inert,false);assert.equal(f.posts.length,0);
  f.nav.toggle();assert.equal(f.attrs['aria-expanded'],'false');assert.equal(f.panel.inert,true);
});
test('Legacy navigation sends only allowlisted same-origin Marketing destinations',()=>{
  const f=navigation();let prevented=0;const event={preventDefault(){prevented++;}};
  assert.equal(f.nav.open(event,{getAttribute:()=>'/marketing/studio'}),false);
  assert.equal(prevented,1);assert.equal(f.posts.length,1);assert.equal(f.posts[0][0].path,'/marketing/studio');assert.equal(f.posts[0][1],'https://clm.example');
  f.nav.open(event,{getAttribute:()=>'/api/admin/users'});assert.equal(f.posts.length,1);
  assert.equal(f.nav.open({...event,ctrlKey:true},{getAttribute:()=>'/marketing'}),true);assert.equal(f.posts.length,1);
});
