import { z } from 'zod';
import { catalog, type Data, type Item, type Row, type Move, today } from './catalog';
export const integer=(v:unknown,min=0)=>z.coerce.number().int().min(min).max(1_000_000_000_000).parse(v);
export function quoteTotal(items:Item[],discount:number,vat:number){
 if(!items.length) throw Error('ต้องมีอย่างน้อย 1 รายการ');
 const subtotal=items.reduce((sum,i)=>sum+integer(i.quantity,1)*integer(i.price),0);
 integer(discount); if(discount>subtotal) throw Error('ส่วนลดมากกว่ายอดรวม');
 z.number().min(0).max(100).parse(vat);
 const tax=Math.round((subtotal-discount)*vat/100);
 if(!Number.isSafeInteger(subtotal+tax)) throw Error('ยอดเงินมากเกินไป');
 return {subtotal,tax,total:subtotal-discount+tax};
}
export function overlaps(a:string,b:string,c:string,d:string){return a<=d&&c<=b;}
export function balance(moves:Move[],material:string,location:string){return moves.filter(m=>m.materialId===material&&m.location===location).reduce((n,m)=>n+m.quantity,0);}
export function stockCheck(available:number,quantity:number){integer(quantity,1);if(quantity>available)throw Error(`สต๊อกไม่พอ คงเหลือ ${available}`);}
export function installmentState(amount:number,paid:number,due:string,now=today()){
 if(paid>=amount)return 'รับครบ';if(paid>0)return 'รับบางส่วน';if(due<now)return 'เกินกำหนด';if(due===now)return 'รอรับ';return 'ยังไม่ถึงกำหนด';
}
export function paidFor(rows:Row[],id:string){return rows.filter(r=>r.kind==='income'&&r.status!=='ยกเลิก'&&r.data.installmentId===id).reduce((n,r)=>n+Number(r.data.amount),0);}
export function projectCost(rows:Row[],moves:Move[],id:string){return moves.filter(m=>m.projectId===id).reduce((n,m)=>n+m.cost,0)+rows.filter(r=>r.kind==='expenses'&&r.status!=='ยกเลิก'&&r.data.projectId===id&&!String(r.data.category).startsWith('วัสดุ')).reduce((n,r)=>n+Number(r.data.amount),0);}
export function contractValue(rows:Row[],id:string){return Number(rows.find(r=>r.id===id)?.data.amount||0)+rows.filter(r=>r.kind==='changes'&&r.data.projectId===id&&r.status==='อนุมัติ').reduce((n,r)=>n+Number(r.data.amount),0);}
export function validate(kind:string,name:string,status:string,input:Data){
 const def=catalog[kind];if(!def)throw Error('ประเภทข้อมูลไม่ถูกต้อง');
 z.string().trim().min(1).max(200).parse(name);if(!def.statuses.includes(status))throw Error('สถานะไม่ถูกต้อง');
 const data:Data={};
 for(const field of def.fields){
  const v=input[field.key];
  if(field.required&&(v===undefined||v===''))throw Error(`กรุณาระบุ ${field.label}`);
  if(v===undefined||v===''){data[field.key]='';continue;}
  if(field.type==='money'||field.type==='number') data[field.key]=integer(v,kind==='changes'?-1_000_000_000:0);
  else if(field.type?.includes('items')){const items=z.array(z.object({name:z.string().min(1),quantity:z.number().int().positive().max(1000000),unit:z.string().min(1),price:z.number().int().nonnegative().max(100000000000),materialId:z.string().optional(),received:z.number().int().nonnegative().optional()})).min(1).max(100).parse(v); data[field.key]=items;}
  else {data[field.key]=z.string().max(10000).parse(v);if(field.type==='email')z.email().parse(v);if(field.options&&!field.options.includes(String(v)))throw Error('ตัวเลือกไม่ถูกต้อง');if(field.type==='date'||field.type==='datetime-local'){if(!/^\d{4}-\d{2}-\d{2}/.test(String(v))||Number.isNaN(Date.parse(String(v))))throw Error('วันที่ไม่ถูกต้อง');}}
 }
 if(data.start&&data.end&&data.end<data.start)throw Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
 if(Number(data.progress)>100)throw Error('ความคืบหน้าต้องไม่เกิน 100%');
 if(Number(data.vat)>100)throw Error('VAT ต้องไม่เกิน 100%');
 if(kind==='quotes')data.total=quoteTotal(data.items as Item[],Number(data.discount),Number(data.vat)).total;
 if(['income','expenses','installments'].includes(kind)&&Number(data.amount)<=0)throw Error('จำนวนเงินต้องมากกว่า 0');
 return data;
}
