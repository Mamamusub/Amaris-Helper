import {readFileSync,writeFileSync} from 'node:fs';
const update=(file,from,to)=>{const s=readFileSync(file,'utf8');if(!s.includes(from))throw Error(`Missing replacement in ${file}`);writeFileSync(file,s.replaceAll(from,to));};
update('src/app/globals.css','repeat(7,minmax(96px,1fr)))','repeat(7,minmax(96px,1fr))');
update('src/components/workspace.tsx',',TrendingUp,',',');
update('src/components/workspace.tsx','<DataTable kind={active}','<DataTable key={active} kind={active}');
update('src/components/record-form.tsx',"import {useForm} from 'react-hook-form';","import {useForm,useWatch} from 'react-hook-form';");
update('src/components/record-form.tsx','const watch=form.watch();','const watch=useWatch({control:form.control});');
const pkg=JSON.parse(readFileSync('package.json','utf8'));pkg.scripts['db:push']='node scripts/prepare-db.mjs && prisma db push';writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
