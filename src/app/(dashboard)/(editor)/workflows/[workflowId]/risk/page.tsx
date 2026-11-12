import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { AppHeader } from "@/components/app-header";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { prefetchWorkflowAnalytics } from "@/features/analytics/server/prefetch";
import { RiskPageContent } from "@/features/risk/components/risk-page-content";
import { prefetchWorkflowRisk } from "@/features/risk/server/prefetch";
import { prefetchWorkflow } from "@/features/workflows/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

interface PageProps {
  params: Promise<{
    workflowId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { workflowId } = await params;

  prefetchWorkflow(workflowId);
  prefetchWorkflowRisk(workflowId);
  prefetchWorkflowAnalytics(workflowId);

  return (
    <>
      <AppHeader />
      <main className="flex-1">
        <HydrateClient>
          <ErrorBoundary
            fallback={<ErrorView message="Error loading risk report" />}
          >
            <Suspense fallback={<LoadingView message="Calculating risk..." />}>
              <RiskPageContent workflowId={workflowId} />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </main>
    </>
  );
};

export default Page;
