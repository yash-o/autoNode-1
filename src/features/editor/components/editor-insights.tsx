"use client";

import { ActivityIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowAnalyticsPanel } from "@/features/analytics/components/workflow-analytics-panel";
import { RiskPanel } from "@/features/risk/components/risk-panel";

export const EditorInsights = ({ workflowId }: { workflowId: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant={open ? "default" : "outline"}
        onClick={() => setOpen((current) => !current)}
      >
        <ActivityIcon className="size-4" />
        Insights
      </Button>
      {open && (
        <div className="max-h-[70vh] w-[380px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
          <Tabs defaultValue="risk">
            <TabsList className="w-full">
              <TabsTrigger value="risk">Risk</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>
            <TabsContent value="risk" className="mt-2">
              <RiskPanel workflowId={workflowId} showReportLink />
            </TabsContent>
            <TabsContent value="analytics" className="mt-2">
              <WorkflowAnalyticsPanel workflowId={workflowId} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
};
