/*
  Warnings:

  - You are about to drop the column `bestSide` on the `DebateResult` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Debate" ADD COLUMN "judgePersonas" TEXT;

-- AlterTable
ALTER TABLE "DebateScore" ADD COLUMN "judgePersonaId" INTEGER;
ALTER TABLE "DebateScore" ADD COLUMN "judgeRoleId" TEXT;
ALTER TABLE "DebateScore" ADD COLUMN "weightedTotal" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DebateResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debateId" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "bestPro" INTEGER,
    "bestCon" INTEGER,
    "overallBest" INTEGER,
    "proTotalScore" REAL,
    "conTotalScore" REAL,
    "judgeIds" TEXT,
    "judgeSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DebateResult_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DebateResult" ("bestCon", "bestPro", "createdAt", "debateId", "id", "judgeSummary", "overallBest", "winner") SELECT "bestCon", "bestPro", "createdAt", "debateId", "id", "judgeSummary", "overallBest", "winner" FROM "DebateResult";
DROP TABLE "DebateResult";
ALTER TABLE "new_DebateResult" RENAME TO "DebateResult";
CREATE UNIQUE INDEX "DebateResult_debateId_key" ON "DebateResult"("debateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DebateScore_judgeRoleId_idx" ON "DebateScore"("judgeRoleId");
