// Synthetic UI-only data. Never imported by production code.
export const creativeOsFixture = String.raw`
DB=buildSeed(); normalizeDB();
DB.staff=[{id:'qa',ten:'Nhóm sáng tạo',role:'Admin',email:'qa@example.test'}];
DB.accounts=[]; DB.notifications=[];
session={ten:'Nhóm sáng tạo',email:'qa@example.test',role:'Admin',prId:'qa',authRoles:['Admin']};
window.__qaFocus=[];document.addEventListener('focusin',event=>window.__qaFocus.push({tag:event.target.tagName,text:event.target.textContent?.slice(0,40)}));
clmRpc=async(action)=>({users:[],documents:[],tasks:[],meetings:[],notifications:[],people:[],trainees:[],rankings:[],audit:[],courses:[]});
DB.kpiOutputSourceVersion='b7-column-g-v1';
DB.sheetKpiOutputs=[{course:'K141',value:80},{course:'K141',value:100},{course:'K140',value:0}];
DB.events=[
 {ma:'CME-K141-001',ten:'Ngày hội sáng tạo',khoa:'K141',truong:'FTU',doiTac:'Đại học Ngoại thương',loai:'Workshop',pr:'qa',status:'Đang xử lý',b1:{},b2:{},b7:{},giaTriDauTu:12000000},
 {ma:'CME-K141-002',ten:'Tuần lễ thiết kế',khoa:'K141',truong:'NEU',doiTac:'Đại học Kinh tế Quốc dân',loai:'Cuộc thi',pr:'qa',status:'Từ chối',b1:{deXuat:'DENY'},b2:{},b7:{},giaTriDauTu:0},
 {ma:'CME-K140-001',ten:'Gặp gỡ đối tác',khoa:'K140',truong:'FTU',doiTac:'Đại học Ngoại thương',loai:'Workshop',pr:'qa',status:'Đang xử lý',b1:{},b2:{},b7:{},giaTriDauTu:5000000},
 {ma:'CME-K139-001',ten:'Hồ sơ khóa trước',khoa:'K139',truong:'HUST',doiTac:'Đại học Bách khoa',loai:'Sự kiện',pr:'qa',status:'Chờ phản hồi',b1:{},b2:{},b7:{},giaTriDauTu:0}
].map(event=>({...event,deadline:'2026-11-20',taoNgay:'2026-11-01',onTime:true,tyLeHoanThanh:0,nhatKy:[],binhLuan:[],
 b2:{quyenLoiOnline:0,quyenLoiOffline:0,booth:0,vatPham:[],hienVat:{},kpiVao:{},chiPhiTT:0},
 b3:{anPham:[]},b4:{inAn:0,vanChuyen:0,khac:0,tong:0,phatSinh:0},
 b5:{engage:{bai:0,react:0,comment:0,share:0,reach:0},follow:0,channels:[]},
 b6:{hocBong:[],voucherCap:0,voucherDung:0},b7:{quyenLoi:[],tyLeHoanThanh:0,kpiRa:{}}}));
ui.overviewCourse=''; syncState.loading=false; syncState.live=false;syncState.badgeState='cached';syncState.badgeText='Dữ liệu cách ly phục vụ QA';
route={page:'doingoai',params:{}}; render();
`;
