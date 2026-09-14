import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteTotal,overlaps,stockCheck,installmentState,projectCost} from '../src/lib/rules';
import type {Row} from '../src/lib/catalog';
test('quote discount and VAT round in satang',()=>{assert.deepEqual(quoteTotal([{name:'งาน',quantity:3,unit:'งาน',price:10001}],1000,7),{subtotal:30003,tax:2030,total:31033});assert.throws(()=>quoteTotal([{name:'x',quantity:1,unit:'x',price:100}],101,7));});
test('team booking date boundaries are inclusive',()=>{assert.equal(overlaps('2026-01-01','2026-01-03','2026-01-03','2026-01-05'),true);assert.equal(overlaps('2026-01-01','2026-01-03','2026-01-04','2026-01-05'),false);});
test('stock cannot go negative or use fractional quantity',()=>{assert.throws(()=>stockCheck(4,5));assert.throws(()=>stockCheck(4,1.5));assert.doesNotThrow(()=>stockCheck(4,4));});
test('installment statuses reflect payments and Bangkok date',()=>{assert.equal(installmentState(10000,0,'2026-09-01','2026-09-02'),'เกินกำหนด');assert.equal(installmentState(10000,3000,'2026-09-01','2026-09-02'),'รับบางส่วน');assert.equal(installmentState(10000,10000,'2026-09-01','2026-09-02'),'รับครบ');assert.equal(installmentState(10000,0,'2026-09-02','2026-09-02'),'รอรับ');assert.equal(installmentState(10000,0,'2026-09-03','2026-09-02'),'ยังไม่ถึงกำหนด');});
test('material purchase cash payment is not counted twice',()=>{const rows=[{kind:'expenses',status:'บันทึกแล้ว',data:{projectId:'p',category:'วัสดุ (จ่ายซื้อ ไม่คิดต้นทุนซ้ำ)',amount:10000}},{kind:'expenses',status:'บันทึกแล้ว',data:{projectId:'p',category:'ค่าแรง',amount:3000}}] as unknown as Row[];assert.equal(projectCost(rows,[{materialId:'m',location:'คลัง',projectId:'p',quantity:-2,cost:2000,batch:'b'}],'p'),5000);});
