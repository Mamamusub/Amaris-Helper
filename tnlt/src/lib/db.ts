import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
mkdirSync(path.resolve('data'),{recursive:true});
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient({adapter:new PrismaBetterSqlite3({url:process.env.DATABASE_URL || `file:${path.resolve('data/tnlt.db')}`})});
if(process.env.NODE_ENV !== 'production') globalDb.prisma=db;
