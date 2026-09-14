'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="loading"><h1>ไม่สามารถแสดงหน้านี้ได้</h1><button onClick={reset}>ลองอีกครั้ง</button></main>;}
