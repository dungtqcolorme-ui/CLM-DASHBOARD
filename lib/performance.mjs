export function scoreNumber(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const raw=String(value).trim().replace(/\s/g,'');
  if(!/^-?\d+(?:[.,]\d+)?$/.test(raw))return null;
  const n=Number(raw.replace(',','.'));return Number.isFinite(n)?n:null;
}
function scoreNameKey(v){
  return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function scoreCourseNo(course){
  const m=String(course||'').match(/K\s*(\d{2,3})/i);
  return m?Number(m[1]):0;
}
function scoreCanonicalPerson(name,course){
  const key=scoreNameKey(name);
  const map={
    btam:'B. Tâm',buitam:'B. Tâm',buibaotam:'B. Tâm',
    mduc:'M. Đức',minhduc:'M. Đức',nguyenminhduc:'M. Đức',
    miduc:'Mi. Đức',
    qdung:'Q. Dũng',quangdung:'Q. Dũng',tranquangdung:'Q. Dũng',
    qudung:'Qu. Dũng',
    nson:'N. Sơn',nguyenson:'N. Sơn',
    klinh:'K. Linh',khanhlinh:'K. Linh',
    khuyen:'K. Huyền',
    mnguyet:'M. Nguyệt',minhnguyet:'M. Nguyệt',
    pthao:'P. Thảo',phuongthao:'P. Thảo',
    qmanh:'Q. Mạnh',quangmanh:'Q. Mạnh',
    thuytrang:'Thuỳ Trang',thuytrang2:'Thuỳ Trang',
    tduong:'T. Dương',
    xnghia:'X. Nghĩa',xuannghia:'X. Nghĩa',
    mtam:'M. Tâm',minhtam:'M. Tâm'
  };
  let canonical=map[key]||name;
  // Quy ước đã chốt: Q. Dũng từ K136 trở đi là người khác → hiển thị Qu. Dũng.
  if(canonical==='Q. Dũng'&&scoreCourseNo(course)>=136)canonical='Qu. Dũng';
  return canonical;
}
function parseCsvGrid(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){
        if(text[i+1]==='"'){cell+='"';i++;}
        else quoted=false;
      }else cell+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===','){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
      else if(ch==='\r'){}
      else cell+=ch;
    }
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  while(rows.length&&rows[rows.length-1].every(v=>String(v??'').trim()===''))rows.pop();
  return rows;
}
export function parseScoreGrid(grid){
  const T=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  const N=scoreNumber;
  const isCourse=s=>/^K\d{2,3}/i.test(s); // K101, K130, K134 (2026)...
  const isWeek=s=>/^Tu[aâ]̂?n\s*\d+/i.test(s)||/^Tuần\s*\d+/i.test(s);
  const isCategory=s=>/^(Hiệu suất|Năng lực|Kỷ luật)$/i.test(s);
  const header=grid?.[0]||[];
  const criteriaStarts=header
    .map((v,i)=>/^Tiêu chí\s*\d+/i.test(T(v))?i:-1)
    .filter(i=>i>=0);
  const blockStarts=criteriaStarts.length?criteriaStarts:Array.from({length:12},(_,i)=>7+i*7);
  function extractCriteriaBlocks(row,group){
    const items=[];
    blockStarts.forEach((start,idx)=>{
      const end=blockStarts[idx+1]||Math.min(row.length,start+7);
      const scoreCol=Math.min(end-1,start+6,row.length-1);
      const label=T(row[start]);
      if(!label)return;
      const rawDetail=row.slice(start+1,scoreCol).map(T).filter(Boolean);
      const detail=rawDetail.filter(v=>v!==label);
      items.push({
        nhom:group,
        noiDung:label,
        diem:N(row[scoreCol]),
        chiTiet:detail,
        block:idx+1
      });
    });
    return items;
  }

  const courses=[];
  let curCourse=null,curWeek=null,curPerson=null;
  // bỏ qua phần header/định nghĩa ở đầu sheet: chỉ xử lý từ khi gặp khóa có chứa dữ liệu tuần
  for(let i=0;i<grid.length;i++){
    const row=grid[i];
    const a=T(row[0]),b=T(row[1]),c=T(row[2]),d=T(row[3]),e=row[4],f=row[5],g=row[6];
    // Khóa mới
    if(a&&isCourse(a)){
      curCourse={ten:a,weeks:[]};courses.push(curCourse);curWeek=null;curPerson=null;
    }
    if(!curCourse)continue;
    // Tuần mới
    if(b&&isWeek(b)){
      curWeek={ten:b,people:[]};curCourse.weeks.push(curWeek);curPerson=null;
    }
    // Dòng nhân sự: cột C có tên, cột F là điểm làm việc, cột G là số giờ
    if(c&&!isCategory(c)&&curWeek&&(T(f)!==''||T(g)!=='')){
      curPerson={ten:scoreCanonicalPerson(c,curCourse.ten),rawTen:c,diemLamViec:N(f),soGio:N(g),hieuSuat:null,nangLuc:null,kyLuat:null,tieuChi:[]};
      curWeek.people.push(curPerson);
    }
    // Dòng hạng mục: cột D = Hiệu suất/Năng lực/Kỷ luật, cột E = điểm
    if(d&&isCategory(d)&&curPerson){
      const val=N(e);
      const key=/Hiệu suất/i.test(d)?'hieuSuat':/Năng lực/i.test(d)?'nangLuc':'kyLuat';
      curPerson[key]=val;
      // Sheet điểm dùng block 7 cột cho mỗi tiêu chí:
      // H:N, O:U, V:AB... Trong đó cột đầu là Nội dung, cột cuối là Điểm.
      // Không lấy số liền kề vì đó là thông số trung gian; phải lấy cột "Điểm" cuối block.
      curPerson.tieuChi.push(...extractCriteriaBlocks(row,d));
      continue;
    }
  }
  // chỉ giữ khóa có dữ liệu
  return courses.filter(c=>c.weeks.some(w=>w.people.length));
}

export {parseCsvGrid,scoreCanonicalPerson,scoreNameKey};
