import {creativeOsFixture} from './creative-os.mjs';

// Isolated review/test data only. Never imported by production modules.
export const workspacesFixture = creativeOsFixture + String.raw`
save=()=>Promise.resolve();flushDBSave=()=>Promise.resolve();
const qaPeople=[['qa','Nhóm sáng tạo','Admin'],['qa-b','Lê Minh An','Staff'],['qa-c','Nguyễn Thảo Linh','Staff']];
DB.staff=qaPeople.map(([id,ten,role])=>({id,ten,role,email:id+'@example.test'}));
DB.accounts=qaPeople.map(([id,ten,role])=>({id,prId:id,ten,role,email:id+'@example.test',status:'active',appRoles:[role==='Admin'?'Admin':'PR Representative']}));
DB.media={auditVersion:MEDIA_SHEET_API.auditVersion,sourceMode:'live',updatedAt:'2026-11-04T00:00:00Z',audit:{planRows:18,performanceRows:18,timelineTabs:9},plan:[],performance:[]};
for(let n=0;n<18;n++){
 const row={course:'K'+(144-n%9),pic:'Nhân sự '+String(n%10+1).padStart(2,'0'),postDate:n===17?'':'2026-11-'+String(n%4+1).padStart(2,'0')};
 DB.media.plan.push({...row,title:'Kế hoạch sáng tạo '+n});
 DB.media.performance.push({...row,metrics:{reach:1200+n*170,hasReach:true,engagement:90+n*11,hasEngagement:true,reacts:70+n*7,comments:12+n,shares:8+n,award:n%3===0?0:100000,hasAward:true,performanceQualified:n%3!==0}});
}
DB.courseInventory={K144:{},K143:{}};
ITEM_TYPES.forEach((name,n)=>{DB.courseInventory.K144[name]={nhap:100+n*20,xuat:25+n*5,ton:n===2?-5:n===4?0:75+n*15};DB.courseInventory.K143[name]={nhap:80+n*10,xuat:40+n*4,ton:40+n*6};});
DB.sheet2Costs={'2026':{year:2026,plannedTotal:125000000,actualTotal:94500000,planned:{Sponsor:{total:65000000},'Sản xuất Hiện vật':{total:45000000},'Hoạt động khác':{total:15000000}},actual:{Sponsor:{total:54000000},'Sản xuất Hiện vật':{total:31500000},'Hoạt động khác':{total:9000000}}}};
DB.apiScholarships=Array.from({length:27},(_,n)=>({id:'hb-qa-'+n,nguoiNhan:'Người nhận '+String(n+1).padStart(2,'0'),email:'nguoinhan'+n+'@example.test',phone:'',ev:'QA-HB-'+n,eventName:'Chương trình sáng tạo '+n,truong:['FTU','NEU','HUST'][n%3],khoa:'K144',date:n===26?'':n===25?'2025-10-01':n%5===0?'2026-02-01':'2026-11-'+String(n%3+1).padStart(2,'0'),giaTriText:['100%','50%','25%'][n%3],trangThai:n%4===0?'Đã dùng':'Chưa dùng'}));
DB.tasks=Array.from({length:16},(_,n)=>({id:'task-qa-'+n,ten:n===0?'Hoàn thiện bộ nhận diện và nội dung truyền thông cho chương trình hợp tác sáng tạo tháng 11':'Chuẩn bị hạng mục sáng tạo '+(n+1),description:'Nội dung công việc minh họa, chỉ dùng để kiểm tra giao diện.',nguoi:n%2?'qa-b':'qa',createdBy:'qa',createdByName:'Nhóm sáng tạo',ownerName:n%2?'Lê Minh An':'Nhóm sáng tạo',collaborators:n%3===0?['qa-c']:[],collaboratorNames:['Nguyễn Thảo Linh'],createdAt:'2026-11-02T08:00:00Z',deadline:'2026-11-'+String(n%7+2).padStart(2,'0'),taskDate:'2026-11-'+String(n%7+2).padStart(2,'0'),shift:n%3===0?'morning':n%3===1?'afternoon':'',status:['Mới tạo','Đang thực hiện','Chờ review','Hoàn thành'][n%4],xong:n%4===3,coordination:n%3===0,comments:[],history:[],version:1}));
DB.meetings=[{id:'meeting-qa-1',title:'Đồng bộ chiến dịch cùng đội sáng tạo',start:'2026-11-04T09:00:00+07:00',end:'2026-11-04T10:00:00+07:00',createdBy:'qa',participantIds:['qa','qa-b'],attendees:['Nhóm sáng tạo','Lê Minh An'],meetingType:'google_meet',link:'https://meet.google.com/qa-example',notes:'Cuộc họp minh họa',status:'Sắp diễn ra',comments:[],history:[]},{id:'meeting-qa-2',title:'Duyệt mẫu ấn phẩm tại studio',start:'2026-11-05T14:00:00+07:00',end:'2026-11-05T15:00:00+07:00',createdBy:'qa',participantIds:['qa'],attendees:['Nhóm sáng tạo'],meetingType:'in_person',location:'Studio minh họa',status:'Sắp diễn ra',comments:[],history:[]}];
ui.course='';ui.inventoryCourse='';ui.scholar={v3:true,q:'',tier:'',year:'',expiry:'',recent:true,page:1};
ui.media={approvedV4:true,course:'all',month:'all',pic:'all',coursePage:1,staffPage:1};
const qaHub=taskHubState();Object.assign(qaHub,{q:'',type:'all',status:'all',owner:'',deadline:'all',shift:'all',view:'week',weekStart:'2026-11-02',month:'2026-11'});
route={page:'doingoai',params:{}};render();
`;
