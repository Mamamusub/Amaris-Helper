import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import path from 'node:path';
export default defineConfig({schema:'prisma/schema.prisma',datasource:{url:`file:${path.resolve((process.env.DATABASE_URL || 'file:./data/tnlt.db').replace(/^file:/,''))}`}});
