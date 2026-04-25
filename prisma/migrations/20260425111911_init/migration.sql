-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channelUrl" TEXT,
    "channelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "configJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CampaignVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "publishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'new',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignVideo_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignVideo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'created',
    "stage" TEXT NOT NULL DEFAULT 'pending',
    "sourceType" TEXT NOT NULL DEFAULT 'youtube',
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceChannel" TEXT,
    "durationSeconds" INTEGER,
    "downloadedPath" TEXT,
    "thumbnailPath" TEXT,
    "configJson" TEXT NOT NULL,
    "transcriptJson" TEXT,
    "campaignId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "viralityScore" INTEGER,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "hookText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "analysisJson" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Highlight_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "masterPath" TEXT,
    "thumbnailPath" TEXT,
    "fileSizeMb" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "viralityScore" INTEGER,
    "captionBurned" BOOLEAN NOT NULL DEFAULT false,
    "hookAdded" BOOLEAN NOT NULL DEFAULT false,
    "renderJson" TEXT,
    "sessionId" TEXT NOT NULL,
    "highlightId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Clip_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Clip_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "Highlight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payloadJson" TEXT NOT NULL,
    "errorJson" TEXT,
    "sessionId" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorJson" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignVideo_campaignId_selected_idx" ON "CampaignVideo"("campaignId", "selected");

-- CreateIndex
CREATE INDEX "CampaignVideo_status_idx" ON "CampaignVideo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVideo_campaignId_videoId_key" ON "CampaignVideo"("campaignId", "videoId");

-- CreateIndex
CREATE INDEX "Session_status_stage_idx" ON "Session"("status", "stage");

-- CreateIndex
CREATE INDEX "Session_campaignId_idx" ON "Session"("campaignId");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");

-- CreateIndex
CREATE INDEX "Highlight_sessionId_selected_idx" ON "Highlight"("sessionId", "selected");

-- CreateIndex
CREATE INDEX "Highlight_sessionId_viralityScore_idx" ON "Highlight"("sessionId", "viralityScore");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_highlightId_key" ON "Clip"("highlightId");

-- CreateIndex
CREATE INDEX "Clip_sessionId_status_idx" ON "Clip"("sessionId", "status");

-- CreateIndex
CREATE INDEX "Clip_viralityScore_idx" ON "Clip"("viralityScore");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_sessionId_idx" ON "Job"("sessionId");

-- CreateIndex
CREATE INDEX "JobStep_jobId_status_idx" ON "JobStep"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobStep_jobId_name_key" ON "JobStep"("jobId", "name");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");
