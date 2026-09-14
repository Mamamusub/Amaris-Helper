'use client';
import {Button} from './ui/button';
export function PrintButton(){return <Button onClick={()=>window.print()}>พิมพ์ / บันทึกเป็น PDF</Button>;}
