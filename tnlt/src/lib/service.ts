import { randomUUID } from 'node:crypto';
import { db } from './db';
import { catalog, type Data, type Item, type Row, type Move, today } from './catalog';
import { balance, integer, overlaps, paidFor, stockCheck, validate } from './rules';
import type { Prisma } from '../generated/prisma/client';
type Tx=Prisma.TransactionClient;
const json=(v:unknown)=>v as Prisma.InputJsonValue;
export async function snapshot(){return {rows:await db.record.findMany({orderBy:{createdAt:'desc'}}),moves:await db.movement.findMany(),audit:await db.audit.findMany({orderBy:{createdAt:'desc'},take:30})};}
async function link(tx:Tx,id:string,kind:string,data:Data){
 for(const field of catalog[kind].fields.filter(f=>f.ref)){
  const target=String(data[field.key]||'');
  if(target){const row=await tx.record.findUnique({where:{id:target}});if(!row||row.kind!==field.ref)throw Error(`ไม่พบ ${field.label}`);await tx.link.upsert({where:{sourceId_role:{sourceId:id,role:field.key}},create:{sourceId:id,targetId:target,role:field.key},update:{targetId:target}});}
  else await tx.link.deleteMany({where:{sourceId:id,role:field.key}});
 }
 if(data.projectId&&data.customerId){const p=await tx.record.findUniqueOrThrow({where:{id:String(data.projectId)}});if((p.data as Data).customerId!==data.customerId)throw Error('ลูกค้าไม่ตรงกับโครงการ');}
}
export type Command={requestId:string;action:string;kind?:string;id?:string;name?:string;status?:string;code?:string;data?:Data;receipts?:number[]};
export async function execute(cmd:Command){
 if(!cmd.requestId||cmd.requestId.length>100)throw Error('requestId ไม่ถูกต้อง');
 return db.$transaction(async tx=>{
  const previous=await tx.audit.findUnique({where:{requestId:cmd.requestId}});if(previous)return {id:previous.recordId};
  const old=cmd.id?await tx.record.findUniqueOrThrow({where:{id:cmd.id}}):null;
  let result=old;
  if(cmd.action==='save'){
   const kind=old?.kind||String(cmd.kind);const name=String(cmd.name||'').trim();const status=String(cmd.status||catalog[kind]?.statuses[0]);
   if(old&&['income','expenses','movements','documents'].includes(kind))throw Error('รายการนี้เก็บประวัติถาวร กรุณากลับรายการหรือสร้างเวอร์ชันใหม่');
   if(old&&kind==='quotes'&&old.status==='อนุมัติ')throw Error('ใบเสนอราคาอนุมัติแล้ว ไม่สามารถแก้ไข');
   if(old&&kind==='purchases'&&['รับบางส่วน','รับครบ','ยกเลิก'].includes(old.status))throw Error('ใบสั่งซื้อมีผลแล้ว ไม่สามารถแก้ไข');
   const data=validate(kind,name,status,cmd.data||{});
   const all=await tx.record.findMany();const rows=all as unknown as Row[];
   if(kind==='bookings'&&status!=='ยกเลิก'){
    const clashes=rows.filter(r=>r.kind==='bookings'&&r.id!==old?.id&&r.data.teamId===data.teamId&&r.status!=='ยกเลิก'&&overlaps(String(data.start),String(data.end),String(r.data.start),String(r.data.end)));
    if(clashes.length)throw Error('คิวซ้อน: '+clashes.map(r=>`${rows.find(p=>p.id===r.data.projectId)?.name} (${r.data.start} – ${r.data.end})`).join(', '));
   }
   if(kind==='income'&&data.installmentId){const inst=rows.find(r=>r.id===data.installmentId&&r.kind==='installments');if(!inst||inst.status==='ยกเลิก'||inst.data.projectId!==data.projectId)throw Error('งวดชำระไม่ตรงกับโครงการ');if(paidFor(rows,inst.id)+Number(data.amount)>Number(inst.data.amount))throw Error('ยอดรับเกินยอดค้างชำระ');}
   if(kind==='installments'&&old&&Number(data.amount)<paidFor(rows,old.id))throw Error('ยอดงวดน้อยกว่ายอดรับแล้ว');
   if(kind==='purchases'){
    if(!['ร่าง','สั่งแล้ว'].includes(status))throw Error('สถานะรับของเปลี่ยนผ่านปุ่มรับของเท่านั้น');
    data.items=(data.items as Item[]).map(i=>{if(!rows.some(r=>r.id===i.materialId&&r.kind==='materials'))throw Error('กรุณาเลือกวัสดุทุกรายการ');return {...i,received:0};});
    data.total=(data.items as Item[]).reduce((s,i)=>s+i.quantity*i.price,0);
   }
   if(kind==='income'||kind==='expenses') {if(status!=='บันทึกแล้ว')throw Error('สร้างรายการด้วยสถานะบันทึกแล้วเท่านั้น');}
   const company=rows.find(r=>r.kind==='settings');const prefix=String(company?.data.prefix||'TNLT').replace(/[^A-Za-z0-9-]/g,'').slice(0,15)||'TNLT';
   const code=old?.code||`${prefix}-${kind.slice(0,3).toUpperCase()}-${randomUUID().slice(0,8).toUpperCase()}`;
   result=old?await tx.record.update({where:{id:old.id},data:{name,status,data:json(data)}}):await tx.record.create({data:{kind,name,status,code,data:json(data)}});
   await link(tx,result.id,kind,data);
   if(kind==='purchases')for(const [index,item] of (data.items as Item[]).entries())await tx.link.upsert({where:{sourceId_role:{sourceId:result.id,role:`material-${index}`}},create:{sourceId:result.id,role:`material-${index}`,targetId:item.materialId!},update:{targetId:item.materialId!}});
   if(kind==='movements'){
    const material=rows.find(r=>r.id===data.materialId&&r.kind==='materials');if(!material)throw Error('ไม่พบวัสดุ');
    const moves=await tx.movement.findMany();const qty=integer(data.quantity,1);const from=String(data.from||'คลังกลาง'),to=String(data.to||'คลังกลาง');const type=String(data.type);const projectId=data.projectId?String(data.projectId):null;const cost=Number(material.data.cost)*qty;
    const add=async(location:string,quantity:number,amount=0,pid:string|null=null)=>tx.movement.create({data:{materialId:material.id,location,quantity,cost:amount,projectId:pid,batch:result!.id}});
    if(type==='รับเข้า')await add(to,qty);
    else if(type==='เบิก'){if(!projectId)throw Error('กรุณาเลือกโครงการ');stockCheck(balance(moves as Move[],material.id,from),qty);await add(from,-qty,cost,projectId);}
    else if(type==='คืน'){if(!projectId)throw Error('กรุณาเลือกโครงการ');const issued=moves.filter(m=>m.materialId===material.id&&m.projectId===projectId).reduce((n,m)=>n-m.quantity,0);stockCheck(issued,qty);const totalCost=moves.filter(m=>m.materialId===material.id&&m.projectId===projectId).reduce((n,m)=>n+m.cost,0);await add(to,qty,-Math.round(totalCost/issued*qty),projectId);}
    else if(type==='โอน'){if(from===to)throw Error('ต้นทางและปลายทางต้องต่างกัน');stockCheck(balance(moves as Move[],material.id,from),qty);await add(from,-qty);await add(to,qty);}
   }
  }else if(cmd.action==='approve'&&old?.kind==='quotes'){
   if(!['ร่าง','ส่งแล้ว'].includes(old.status))throw Error('สถานะใบเสนอราคาไม่รองรับการอนุมัติ');
   result=await tx.record.update({where:{id:old.id},data:{status:'อนุมัติ'}});
  }else if(cmd.action==='convert'&&old?.kind==='quotes'){
   if(old.status!=='อนุมัติ')throw Error('ต้องอนุมัติใบเสนอราคาก่อน');
   const existing=await tx.link.findUnique({where:{sourceId_role:{sourceId:old.id,role:'convertedProject'}}});if(existing)return {id:existing.targetId};
   const d=old.data as Data;
   if(d.projectId)throw Error('ใบเสนอราคานี้ผูกกับโครงการเดิมแล้ว');
   const data={customerId:d.customerId,amount:d.total,budget:0,type:'ออกแบบพร้อมก่อสร้าง',location:'',owner:'',start:today(),end:today(),progress:0};
   result=await tx.record.create({data:{kind:'projects',code:`PRJ-${old.code}`,name:old.name,status:'วางแผน',data:json(data)}});
   await link(tx,result.id,'projects',data);await tx.link.create({data:{sourceId:old.id,targetId:result.id,role:'convertedProject'}});
   await tx.record.update({where:{id:old.id},data:{data:json({...d,projectId:result.id})}});
  }else if(cmd.action==='receive'&&old?.kind==='purchases'){
   if(!['สั่งแล้ว','รับบางส่วน'].includes(old.status))throw Error('ใบสั่งซื้อยังไม่พร้อมรับของ');
   const d=old.data as Data;const items=d.items as Item[];const quantities=cmd.receipts||[];
   if(quantities.length!==items.length||!quantities.some(q=>q>0))throw Error('ระบุจำนวนรับอย่างน้อย 1 รายการ');
   const updated=[];
   for(const [index,item] of items.entries()){
    const q=integer(quantities[index]);if(q+(item.received||0)>item.quantity)throw Error('รับเกินจำนวนสั่ง');
    if(q)await tx.movement.create({data:{materialId:item.materialId!,location:String(d.location),quantity:q,cost:0,batch:`${old.id}:${cmd.requestId}`}});
    updated.push({...item,received:(item.received||0)+q});
   }
   result=await tx.record.update({where:{id:old.id},data:{status:updated.every(i=>i.received===i.quantity)?'รับครบ':'รับบางส่วน',data:json({...d,items:updated})}});
  }else if(cmd.action==='cancel'&&old){
   if(old.status==='ยกเลิก')throw Error('ยกเลิกแล้ว');
   if(!['income','expenses','appointments','bookings','tasks','purchases','installments','movements'].includes(old.kind))throw Error('รายการนี้ยกเลิกไม่ได้');
   if(old.kind==='purchases'&&(old.data as Data).items&&(old.data as Data).items instanceof Array&&((old.data as Data).items as Item[]).some(i=>Number(i.received)>0))throw Error('รับของแล้ว ต้องเก็บใบสั่งซื้อเพื่อการตรวจสอบ');
   if(old.kind==='installments'){const rows=await tx.record.findMany();if(paidFor(rows as unknown as Row[],old.id)>0)throw Error('ต้องกลับรายการรับเงินก่อน');}
   if(old.kind==='movements'){
    const moves=await tx.movement.findMany();const batch=moves.filter(m=>m.batch===old.id);
    for(const m of batch){if(m.quantity>0)stockCheck(balance(moves as Move[],m.materialId,m.location),m.quantity);if(m.cost<0){const cost=moves.filter(x=>x.materialId===m.materialId&&x.projectId===m.projectId).reduce((s,x)=>s+x.cost,0);if(cost-m.cost<0)throw Error('ไม่สามารถกลับรายการได้');}await tx.movement.create({data:{materialId:m.materialId,location:m.location,quantity:-m.quantity,cost:-m.cost,projectId:m.projectId,batch:`reverse:${old.id}`}});}
   }
   result=await tx.record.update({where:{id:old.id},data:{status:'ยกเลิก'}});
  }else if(cmd.action==='document-status'&&old?.kind==='documents'){
   if(!catalog.documents.statuses.includes(String(cmd.status)))throw Error('สถานะไม่ถูกต้อง');result=await tx.record.update({where:{id:old.id},data:{status:cmd.status}});
  }else throw Error('คำสั่งไม่ถูกต้อง');
  if(!result)throw Error('ไม่พบรายการ');
  await tx.audit.create({data:{requestId:cmd.requestId,action:cmd.action,recordId:result.id,before:old?json(old):undefined,after:json(result)}});
  return {id:result.id};
 },{timeout:15000});
}
