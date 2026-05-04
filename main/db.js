const { PrismaClient } = require('@prisma/client');
const path = require('path');
const { app } = require('electron');

const isDev = !app.isPackaged;

const dbPath = isDev
  ? path.join(__dirname, '..', 'prisma', 'dev.db')
  : path.join(app.getPath('userData'), 'openrise.db');

process.env.DATABASE_URL = `file:${dbPath}`;

const prisma = new PrismaClient();

module.exports = prisma;
