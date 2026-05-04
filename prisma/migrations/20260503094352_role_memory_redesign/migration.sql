/*
  Warnings:

  - You are about to drop the `Individual` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `individualId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `Message` table. All the data in the column will be lost.
  - Added the required column `roleId` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sender` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Individual_roleId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Individual";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "Memory_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("content", "createdAt", "id") SELECT "content", "createdAt", "id" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_roleId_idx" ON "Message"("roleId");
CREATE TABLE "new_Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "soul" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "avatar" TEXT,
    "brainId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_brainId_fkey" FOREIGN KEY ("brainId") REFERENCES "Brain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Role" ("brainId", "id", "name", "rule", "soul") SELECT "brainId", "id", "name", "rule", "soul" FROM "Role";
DROP TABLE "Role";
ALTER TABLE "new_Role" RENAME TO "Role";
CREATE INDEX "Role_brainId_idx" ON "Role"("brainId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Memory_roleId_key" ON "Memory"("roleId");

-- CreateIndex
CREATE INDEX "Memory_roleId_idx" ON "Memory"("roleId");
