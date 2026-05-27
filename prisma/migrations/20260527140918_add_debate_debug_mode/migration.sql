-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Debate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proTopic" TEXT NOT NULL,
    "conTopic" TEXT NOT NULL,
    "background" TEXT,
    "debugMode" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ongoing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Debate" ("background", "conTopic", "createdAt", "id", "proTopic", "status", "summary", "updatedAt") SELECT "background", "conTopic", "createdAt", "id", "proTopic", "status", "summary", "updatedAt" FROM "Debate";
DROP TABLE "Debate";
ALTER TABLE "new_Debate" RENAME TO "Debate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
