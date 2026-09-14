import { db } from '../src/lib/db';
import { addDays,format } from 'date-fns';
import type { Data, Item } from '../src/lib/catalog';
import { quoteTotal } from '../src/lib/rules';
import { catalog,today } from '../src/lib/catalog';
const day=(n:number)=>format(addDays(new Date(`${today()}T12:00:00+07:00`),n),'yyyy-MM-dd');
async function put(kind:string,id:string,name:string,data:Data,status=catalog[kind].statuses[0]){
 const row=await db.record.upsert({where:{id},update:{},create:{id,kind,code:`DEMO-${id.toUpperCase()}`,name,status,data}});
 for(const field of catalog[kind].fields.filter(f=>f.ref)){const target=String((row.data as Data)[field.key]||'');if(target)await db.link.upsert({where:{sourceId_role:{sourceId:id,role:field.key}},update:{},create:{sourceId:id,targetId:target,role:field.key}});}
 return row;
}
async function main(){
 await put('settings','company','TNLT ออกแบบและก่อสร้าง',{address:'88 ถนนรามอินทรา เขตบางเขน กรุงเทพมหานคร 10220',phone:'02-000-0000',taxId:'0000000000000',vat:7,prefix:'TNLT',categories:'ออกแบบ, ก่อสร้าง, รีโนเวต\nวัสดุ, ค่าแรง, ผู้รับเหมาช่วง, อื่น ๆ'});
 const customers=['คุณณัฐพล วัฒนกุล','คุณพิมพ์ชนก ศรีสุข','บริษัท กรีนสเปซ จำกัด','คุณธนกร รุ่งเรือง','คุณอรทัย พงษ์พิพัฒน์','บริษัท บ้านดี จำกัด','คุณวิชัย ใจดี','คุณสุภาวดี นาคทอง'];
 for(const [i,name]of customers.entries())await put('customers',`customer-${i}`,name,{contact:name,phone:`080-000-000${i}`,email:`demo${i}@example.com`,address:'กรุงเทพมหานคร (ข้อมูลสาธิต)',interest:i%2?'รีโนเวต':'ออกแบบพร้อมก่อสร้าง',budget:(i+1)*100000000,source:'แนะนำจากลูกค้า',owner:'คุณมินตรา',history:'พูดคุยความต้องการเบื้องต้นแล้ว',followup:day(i+1)},i<6?'ได้งาน':'กำลังคุย');
 const projects=['บ้านพักอาศัย รามอินทรา','รีโนเวตคาเฟ่ อารีย์','อาคารสำนักงาน กรีนสเปซ','บ้านโมเดิร์น บางนา','ตกแต่งภายใน สุขุมวิท','ทาวน์โฮม บ้านดี'];
 for(const [i,name]of projects.entries())await put('projects',`project-${i}`,name,{customerId:`customer-${i}`,type:i%2?'รีโนเวต':'ออกแบบพร้อมก่อสร้าง',location:['รามอินทรา กรุงเทพฯ','อารีย์ กรุงเทพฯ','ปากเกร็ด นนทบุรี','บางนา กรุงเทพฯ','สุขุมวิท กรุงเทพฯ','ลาดพร้าว กรุงเทพฯ'][i],owner:i%2?'คุณมินตรา':'คุณธนภัทร',budget:(i+2)*80000000,amount:(i+2)*110000000,start:day(-40-i*3),end:day(i===4?-3:30+i*8),progress:[68,42,25,86,92,10][i]},i===5?'วางแผน':'กำลังดำเนินการ');
 for(const [i,specialty]of ['โครงสร้าง','ไฟฟ้า','ประปา','สีและฝ้า','กระเบื้อง'].entries()){await put('teams',`team-${i}`,`ทีม${specialty} ${['ช่างเอก','ช่างบอล','ช่างชัย','ช่างดล','ช่างเอ'][i]}`,{leader:['เอกชัย','บวร','ชัยวัฒน์','ดลชัย','อานนท์'][i],specialty,phone:`081-000-000${i}`,people:4+i,rate:60000,unit:'บาท / คน / วัน'});await put('bookings',`booking-${i}`,`งาน${specialty}`,{projectId:`project-${i}`,teamId:`team-${i}`,start:day(-2),end:day(5+i),note:'คิวสาธิต'});}
 const materials=['ปูนซีเมนต์ปอร์ตแลนด์','ทรายหยาบ','หิน 3/4 นิ้ว','เหล็กเส้น DB12','เหล็กเส้น DB16','อิฐมวลเบา','อิฐแดง','ลวดผูกเหล็ก','ไม้แบบ','ไม้อัด','ท่อ PVC 1 นิ้ว','ข้องอ PVC','สายไฟ THW 2.5','ปลั๊กไฟ','สวิตช์ไฟ','สีน้ำภายใน','สีรองพื้น','แผ่นยิปซัม','กระเบื้อง 60x60','ปูนกาว'];
 for(const [i,name]of materials.entries()){
  await put('materials',`material-${i}`,name,{category:i<10?'โครงสร้าง':i<15?'งานระบบ':'ตกแต่ง',unit:i===0?'ถุง':i===1||i===2?'คิว':i>16?'กล่อง':'ชิ้น',minimum:20,cost:(100+i*25)*100});
  await db.movement.upsert({where:{id:`opening-${i}`},update:{},create:{id:`opening-${i}`,materialId:`material-${i}`,location:'คลังกลาง',quantity:i%6===0?8:100+i*3,cost:0,batch:'seed-opening'}});
 }
 for(let i=0;i<12;i++)await put('appointments',`appointment-${i}`,['สำรวจพื้นที่และวัดระยะ','ประชุมสรุปแบบกับลูกค้า','ตรวจความคืบหน้าหน้างาน','ตรวจรับวัสดุก่อสร้าง'][i%4],{projectId:`project-${i%6}`,customerId:`customer-${i%6}`,type:['สำรวจหน้างาน','ประชุม','ก่อสร้าง'][i%3],start:`${day(i-3)}T${i%2?'13':'09'}:00`,end:`${day(i-3)}T${i%2?'15':'11'}:00`,owner:'คุณธนภัทร',location:'หน้างานโครงการ',note:'ข้อมูลสาธิต'},i<2?'เสร็จแล้ว':'นัดหมายแล้ว');
 for(let i=0;i<5;i++){const items:Item[]=[{name:'งานออกแบบและก่อสร้าง',quantity:1,unit:'งาน',price:(i+2)*100000000}];await put('quotes',`quote-${i}`,`ใบเสนอราคา ${projects[i]}`,{customerId:`customer-${i}`,items,discount:0,vat:7,total:quoteTotal(items,0,7).total,expiry:day(30),terms:'ชำระตามความคืบหน้างาน ใบเสนอราคาสาธิต'},['ร่าง','ส่งแล้ว','อนุมัติ','ส่งแล้ว','ไม่อนุมัติ'][i]);}
 for(let i=0;i<6;i++){
  await put('tasks',`task-${i}`,['เตรียมพื้นที่และวางผัง','ติดตั้งงานระบบ','ตรวจงานโครงสร้าง'][i%3],{projectId:`project-${i}`,teamId:`team-${i%5}`,owner:'คุณธนภัทร',start:day(-10),end:day(i-2),note:'แผนงานสาธิต'},'กำลังดำเนินการ');
  await put('installments',`installment-${i}`,`งวดที่ 1 • ${projects[i]}`,{projectId:`project-${i}`,amount:50000000,due:day(i-2),note:'มัดจำเริ่มงาน'});
  await put('income',`income-${i}`,`รับเงินมัดจำ ${projects[i]}`,{projectId:`project-${i}`,installmentId:`installment-${i}`,amount:(i===0?25000000:15000000),date:day(-i*16),category:'เงินงวด',channel:'โอนธนาคาร',note:'ข้อมูลสาธิต'});
  await put('expenses',`expense-${i}`,`ค่าแรง ${projects[i]}`,{projectId:`project-${i}`,amount:(i+1)*1500000,date:day(-i*16),category:'ค่าแรง',channel:'โอนธนาคาร',note:'ข้อมูลสาธิต'});
  await put('movements',`issue-${i}`,`เบิกวัสดุ ${projects[i]}`,{materialId:`material-${i+1}`,projectId:`project-${i}`,type:'เบิก',quantity:10,from:'คลังกลาง',to:'',note:'ข้อมูลสาธิต'});
  await db.movement.upsert({where:{id:`issued-${i}`},update:{},create:{id:`issued-${i}`,materialId:`material-${i+1}`,location:'คลังกลาง',quantity:-10,cost:10*(125+i*25)*100,projectId:`project-${i}`,batch:`issue-${i}`}});
  await put('contracts',`contract-${i}`,`สัญญา ${projects[i]}`,{projectId:`project-${i}`,customerId:`customer-${i}`,amount:(i+2)*110000000,start:day(-40),end:day(60),note:'สัญญาสาธิต'},'ลงนามแล้ว');
 }
 await put('vendors','vendor-0','บริษัท วัสดุดี จำกัด',{contact:'คุณสุชาติ',phone:'02-000-0100',category:'วัสดุก่อสร้าง'});
 await put('purchases','purchase-0','สั่งวัสดุสำหรับงานโครงสร้าง',{vendorId:'vendor-0',projectId:'project-0',location:'คลังกลาง',expected:day(3),items:[{materialId:'material-0',name:materials[0],quantity:50,unit:'ถุง',price:10000,received:0}],total:500000},'สั่งแล้ว');
 await put('tools','tool-0','สว่านกระแทก',{condition:'ดี',location:'คลังกลาง',note:'ข้อมูลสาธิต'});
 await put('reports','report-0','สรุปงานประจำวัน',{projectId:'project-0',date:day(0),details:'เทคอนกรีตพื้นชั้น 2 และตรวจแนวเสา',people:8,progress:68,issues:'รอวัสดุสำหรับงานถัดไป'});
 await put('changes','change-0','เพิ่มจุดปลั๊กไฟห้องทำงาน',{projectId:'project-0',amount:1200000,days:1,note:'ลูกค้ายืนยันแล้ว'},'อนุมัติ');
 await put('inspections','inspection-0','ตรวจแนวกระเบื้องห้องน้ำ',{projectId:'project-0',owner:'ช่างเอ',due:day(7),details:'ตรวจระดับและยาแนว'},'ต้องแก้ไข');
 await put('warranties','warranty-0','ประกันงานระบบ',{projectId:'project-4',start:day(0),end:day(365),owner:'ช่างบอล',details:'รับประกันงานติดตั้ง 1 ปี'});
 await put('members','member-0','คุณธนภัทร',{role:'ผู้จัดการโครงการ (อ้างอิงเท่านั้น)',phone:'080-000-0101',email:'manager@example.com'});
 console.log('Seed complete: ข้อมูลสาธิต ไม่เขียนทับข้อมูลเดิม');
}
main().finally(()=>db.$disconnect());
