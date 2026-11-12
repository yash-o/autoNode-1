-- CreateEnum
CREATE TYPE "NodeExecutionStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "node_execution_record" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "status" "NodeExecutionStatus" NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "node_execution_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "node_execution_record_executionId_nodeId_key" ON "node_execution_record"("executionId", "nodeId");

-- AddForeignKey
ALTER TABLE "node_execution_record" ADD CONSTRAINT "node_execution_record_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
