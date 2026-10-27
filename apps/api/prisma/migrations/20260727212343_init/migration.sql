-- CreateEnum
CREATE TYPE "GameHistoryStatus" AS ENUM ('STARTED', 'FINISHED');

-- CreateTable
CREATE TABLE "GameHistory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GameHistoryStatus" NOT NULL DEFAULT 'STARTED',
    "hostPlayerId" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "players" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMessage" (
    "id" TEXT NOT NULL,
    "gameCode" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameHistory_code_key" ON "GameHistory"("code");

-- CreateIndex
CREATE INDEX "GameMessage_gameCode_createdAt_idx" ON "GameMessage"("gameCode", "createdAt");

-- AddForeignKey
ALTER TABLE "GameMessage" ADD CONSTRAINT "GameMessage_gameCode_fkey" FOREIGN KEY ("gameCode") REFERENCES "GameHistory"("code") ON DELETE CASCADE ON UPDATE CASCADE;
