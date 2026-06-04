-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "soul" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "summary" TEXT,
    "avatar" TEXT,
    "brainId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_brainId_fkey" FOREIGN KEY ("brainId") REFERENCES "Brain" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Role" ("avatar", "brainId", "createdAt", "id", "name", "rule", "soul", "summary") SELECT "avatar", "brainId", "createdAt", "id", "name", "rule", "soul", "summary" FROM "Role";
DROP TABLE "Role";
ALTER TABLE "new_Role" RENAME TO "Role";
CREATE INDEX "Role_brainId_idx" ON "Role"("brainId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
