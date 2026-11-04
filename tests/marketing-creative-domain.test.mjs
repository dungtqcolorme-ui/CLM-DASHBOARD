import test from 'node:test';
import assert from 'node:assert/strict';
import {routeLoader} from './helpers/load-route.mjs';
let domain={};try{domain=routeLoader({})('lib/marketing/creative-domain.ts');}catch(e){if(e.code!=='ENOENT')throw e;}
const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', layerId='33333333-3333-4333-8333-333333333333';
const scene=()=>({schema_version:1,width:1080,height:1350,format:'hybrid',pages:[{id,background:'#ffffff',layers:[{id:layerId,type:'text',x:50,y:60,width:600,height:200,rotation:0,opacity:1,locked:false,text:'Nội dung\nchỉnh sửa',font_size:48,font_family:'Arial',fill:'#222222',align:'left'}]}]});
test('Creative scene preserves editable structure and rejects executable or unknown properties',()=>{
 assert.equal(typeof domain.parseCreativeScene,'function');assert.deepEqual(domain.parseCreativeScene(scene()),scene());
 for(const value of [{...scene(),url:'https://evil.test'}, {...scene(),pages:[{...scene().pages[0],html:'<script>'}]}]) assert.throws(()=>domain.parseCreativeScene(value));
 const v=scene();v.pages[0].layers[0].font_family='url(javascript:x)';assert.throws(()=>domain.parseCreativeScene(v));
});
test('Creative scene validates finite geometry, UUID uniqueness, bounds and allowed sizes',()=>{
 assert.equal(typeof domain.parseCreativeScene,'function');
 for(const patch of [{width:12000},{height:1},{pages:[]},{schema_version:2}])assert.throws(()=>domain.parseCreativeScene({...scene(),...patch}));
 for(const patch of [{x:Infinity},{y:12001},{opacity:-0.1},{width:0},{font_size:241},{fill:'red'},{locked:'false'},{text:'x'.repeat(2001)}]){const s=scene();Object.assign(s.pages[0].layers[0],patch);assert.throws(()=>domain.parseCreativeScene(s));}
 const duplicate=scene();duplicate.pages[0].layers.push({...duplicate.pages[0].layers[0]});assert.throws(()=>domain.parseCreativeScene(duplicate));
 const tooMany=scene();tooMany.pages=Array.from({length:11},()=>scene().pages[0]);assert.throws(()=>domain.parseCreativeScene(tooMany));
});
test('Images are opaque asset references with safe fit, logo containment and no external URL',()=>{
 assert.equal(typeof domain.parseCreativeScene,'function');const s=scene();s.pages[0].layers=[{id:layerId,type:'image',x:0,y:0,width:500,height:400,rotation:0,opacity:1,locked:true,asset_id:other,fit:'contain',role:'logo'}];
 assert.equal(domain.parseCreativeScene(s).pages[0].layers[0].asset_id,other);
 s.pages[0].layers[0].fit='cover';assert.throws(()=>domain.parseCreativeScene(s));s.pages[0].layers[0].fit='contain';s.pages[0].layers[0].src='data:image/svg+xml,...';assert.throws(()=>domain.parseCreativeScene(s));
});
const reservation=()=>({action:'reserve_asset',team_id:id,campaign_id:null,title:'Ảnh thật',filename:'anh.png',mime_type:'image/png',byte_size:300,width:1080,height:1080,reported_sha256:'a'.repeat(64),provenance:'Tác giả cung cấp',author:'Người chụp',event:'Ngày hội',tags:['booth']});
test('Asset reservation is bounded immutable metadata with no actor/path/rights override',()=>{
 assert.equal(typeof domain.parseCreativeCommand,'function');assert.deepEqual(domain.parseCreativeCommand(reservation()),reservation());
 for(const patch of [{rights:'approved'},{creator_id:other},{storage_path:'../x'},{filename:'../x.png'},{mime_type:'image/svg+xml'},{byte_size:8388609},{width:12001},{width:12000,height:12000},{reported_sha256:'bad'},{tags:['a','a']}])assert.throws(()=>domain.parseCreativeCommand({...reservation(),...patch}));
});
test('Creative commands bind expected versions, explicit template scope and human rights conditions',()=>{
 assert.equal(typeof domain.parseCreativeCommand,'function');
 assert.equal(domain.parseCreativeCommand({action:'save_design',id,expected_version:1,title:'Thiết kế',scene:scene()}).scene.pages.length,1);
 for(const input of [{action:'save_design',id,title:'x',scene:scene()},{action:'generate_image'},{action:'create_design',content_id:id,title:'x',scene:scene(),is_default:false},{action:'prepare_export',id,expected_version:0},{action:'review_asset',id,expected_version:1,rights:'approved',reason:'',allowed_channels:['facebook'],valid_until:null},{action:'review_asset',id,expected_version:1,rights:'approved',reason:'Đã kiểm tra',allowed_channels:['instagram'],valid_until:null}])assert.throws(()=>domain.parseCreativeCommand(input));
 const review={action:'review_asset',id,expected_version:1,rights:'approved',reason:'Đã kiểm tra',allowed_channels:['facebook'],valid_until:'2030-01-01T07:00:00+07:00'};assert.equal(domain.parseCreativeCommand(review).valid_until,'2030-01-01T00:00:00.000Z');
 for(const date of ['2030-02-30T00:00:00Z','2030-01-01','2030-01-01T00:00:00'])assert.throws(()=>domain.parseCreativeCommand({...review,valid_until:date}));
});
test('Preflight blocks unavailable, wrong scope, expired or revoked photos and reports manual checks',()=>{
 assert.equal(typeof domain.preflightDesign,'function');const s=scene();s.pages[0].layers=[{id:layerId,type:'image',x:0,y:0,width:1080,height:1080,rotation:0,opacity:1,locked:false,asset_id:other,fit:'cover',role:'photo'}];const design={scene:s,team_id:id,campaign_id:id};const asset={id:other,team_id:id,campaign_id:null,status:'ready',rights:'approved',valid_until:null,allowed_channels:['facebook'],width:1080,height:1080};
 assert.equal(domain.preflightDesign(design,[asset]).filter(i=>i.severity==='blocker').length,0);
 assert.ok(domain.preflightDesign(design,[asset]).some(i=>i.code==='manual_review'));
 for(const patch of [{rights:'revoked'},{rights:'internal_only'},{valid_until:'2000-01-01T00:00:00Z'},{team_id:other},{campaign_id:other},{status:'pending_upload'},{allowed_channels:['internal']}])assert.ok(domain.preflightDesign(design,[{...asset,...patch}]).some(i=>i.severity==='blocker'));
 assert.ok(domain.preflightDesign(design,[]).some(i=>i.code==='asset_missing'));
});
test('Preflight bounds and image quality remain advisory while factual verification is never fabricated',()=>{
 assert.equal(typeof domain.preflightDesign,'function');const s=scene();s.pages[0].layers[0].x=1050;const issues=domain.preflightDesign({scene:s,team_id:id,campaign_id:id},[]);assert.ok(issues.some(i=>i.code==='outside_canvas'&&i.severity==='warning'));assert.ok(issues.some(i=>i.code==='manual_review'));
});
