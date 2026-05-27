-- CreateTable
CREATE TABLE "Debate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proTopic" TEXT NOT NULL,
    "conTopic" TEXT NOT NULL,
    "background" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ongoing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DebatePosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debateId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "brainId" TEXT NOT NULL,
    CONSTRAINT "DebatePosition_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DebateMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debateId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "roundIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DebateMessage_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DebateScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debateId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "scoreContent" INTEGER,
    "scoreLogic" INTEGER,
    "scoreExpression" INTEGER,
    "scoreRebuttal" INTEGER,
    "totalScore" REAL,
    "judgeComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DebateScore_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DebateResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debateId" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "bestPro" INTEGER,
    "bestCon" INTEGER,
    "overallBest" INTEGER,
    "bestSide" TEXT,
    "judgeSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DebateResult_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "Debate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DebatePosition_roleId_idx" ON "DebatePosition"("roleId");

-- CreateIndex
CREATE INDEX "DebatePosition_debateId_idx" ON "DebatePosition"("debateId");

-- CreateIndex
CREATE INDEX "DebateMessage_debateId_createdAt_idx" ON "DebateMessage"("debateId", "createdAt");

-- CreateIndex
CREATE INDEX "DebateScore_debateId_idx" ON "DebateScore"("debateId");

-- CreateIndex
CREATE UNIQUE INDEX "DebateResult_debateId_key" ON "DebateResult"("debateId");
