-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GM', 'PLAYER');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('NUMBER', 'BAR', 'TEXT', 'TABLE', 'CONTAINER', 'GROUP');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('CHARACTER', 'ITEM', 'SKILL', 'PASSIVE_TALENT', 'MUTATION', 'BODY_PART', 'OTHER');

-- CreateEnum
CREATE TYPE "EffectOperation" AS ENUM ('ADD', 'SUBTRACT', 'MULTIPLY', 'PERCENT_BONUS', 'CREATE_NODE', 'CREATE_GROUP', 'SET_BAR_MAX', 'PATCH_NODE_PROPS');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'APPLY_TEMPLATE', 'RECALCULATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAssignment" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterNode" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "NodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "path" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "computed" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CharacterNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTemplate" (
    "id" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultCharacter" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "EntityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateNode" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "NodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "path" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Effect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "operation" "EffectOperation" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sourceNodeId" TEXT,
    "sourceTemplateNodeId" TEXT,
    "characterId" TEXT,
    "templateId" TEXT,
    "condition" JSONB NOT NULL DEFAULT '{"kind":"always"}',
    "target" JSONB NOT NULL,
    "source" JSONB NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Effect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyEdge" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "effectId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DependencyEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "characterId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "fieldPath" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Character_name_idx" ON "Character"("name");

-- CreateIndex
CREATE INDEX "Character_ownerId_idx" ON "Character"("ownerId");

-- CreateIndex
CREATE INDEX "CharacterAssignment_userId_idx" ON "CharacterAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterAssignment_characterId_userId_key" ON "CharacterAssignment"("characterId", "userId");

-- CreateIndex
CREATE INDEX "CharacterNode_characterId_parentId_order_idx" ON "CharacterNode"("characterId", "parentId", "order");

-- CreateIndex
CREATE INDEX "CharacterNode_characterId_path_idx" ON "CharacterNode"("characterId", "path");

-- CreateIndex
CREATE INDEX "CharacterNode_type_idx" ON "CharacterNode"("type");

-- CreateIndex
CREATE INDEX "EntityTemplate_kind_name_idx" ON "EntityTemplate"("kind", "name");

-- CreateIndex
CREATE INDEX "EntityTemplate_isDefaultCharacter_idx" ON "EntityTemplate"("isDefaultCharacter");

-- CreateIndex
CREATE INDEX "TemplateNode_templateId_parentId_order_idx" ON "TemplateNode"("templateId", "parentId", "order");

-- CreateIndex
CREATE INDEX "TemplateNode_templateId_path_idx" ON "TemplateNode"("templateId", "path");

-- CreateIndex
CREATE INDEX "Effect_characterId_enabled_idx" ON "Effect"("characterId", "enabled");

-- CreateIndex
CREATE INDEX "Effect_templateId_enabled_idx" ON "Effect"("templateId", "enabled");

-- CreateIndex
CREATE INDEX "Effect_sourceNodeId_idx" ON "Effect"("sourceNodeId");

-- CreateIndex
CREATE INDEX "Effect_sourceTemplateNodeId_idx" ON "Effect"("sourceTemplateNodeId");

-- CreateIndex
CREATE INDEX "DependencyEdge_targetNodeId_idx" ON "DependencyEdge"("targetNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "DependencyEdge_characterId_sourceNodeId_targetNodeId_reason_key" ON "DependencyEdge"("characterId", "sourceNodeId", "targetNodeId", "reason");

-- CreateIndex
CREATE INDEX "AuditLog_characterId_createdAt_idx" ON "AuditLog"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAssignment" ADD CONSTRAINT "CharacterAssignment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAssignment" ADD CONSTRAINT "CharacterAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterNode" ADD CONSTRAINT "CharacterNode_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterNode" ADD CONSTRAINT "CharacterNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CharacterNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTemplate" ADD CONSTRAINT "EntityTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateNode" ADD CONSTRAINT "TemplateNode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateNode" ADD CONSTRAINT "TemplateNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TemplateNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Effect" ADD CONSTRAINT "Effect_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "CharacterNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Effect" ADD CONSTRAINT "Effect_sourceTemplateNodeId_fkey" FOREIGN KEY ("sourceTemplateNodeId") REFERENCES "TemplateNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Effect" ADD CONSTRAINT "Effect_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Effect" ADD CONSTRAINT "Effect_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyEdge" ADD CONSTRAINT "DependencyEdge_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyEdge" ADD CONSTRAINT "DependencyEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "CharacterNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyEdge" ADD CONSTRAINT "DependencyEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "CharacterNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
