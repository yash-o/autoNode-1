-- CreateIndex
CREATE INDEX "node_execution_record_workflowId_nodeType_idx" ON "node_execution_record"("workflowId", "nodeType");

-- CreateIndex
CREATE INDEX "node_execution_record_executionId_idx" ON "node_execution_record"("executionId");
