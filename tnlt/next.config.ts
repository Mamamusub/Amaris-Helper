import path from 'node:path';
const config = { turbopack: { root: path.resolve('.') }, serverExternalPackages: ['@prisma/adapter-better-sqlite3','better-sqlite3'] };
export default config;
