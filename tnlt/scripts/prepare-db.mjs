import 'dotenv/config';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const file=path.resolve((process.env.DATABASE_URL||'file:./data/tnlt.db').replace(/^file:/,''));
mkdirSync(path.dirname(file),{recursive:true});
if(!existsSync(file))writeFileSync(file,'',{flag:'wx'});
