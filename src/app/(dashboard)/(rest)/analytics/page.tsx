import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { EntityContainer, EntityHeader } from "@/components/entity-components";
import {
  AnalyticsDashboard,
  AnalyticsError,
  AnalyticsLoading,
} from "@/features/analytics/components/analytics-dashboard";
import { prefetchGlobalAnalytics } from "@/features/analytics/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";

const Page = async () => {
  await requireAuth();

  prefetchGlobalAnalytics();

  return (
    <EntityContainer
      header={
        <EntityHeader
          title="Analytics"
          description="Execution health across all of your workflows"
        />
      }
    >
      <HydrateClient>
        <ErrorBoundary fallback={<AnalyticsError />}>
          <Suspense fallback={<AnalyticsLoading />}>
            <AnalyticsDashboard />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </EntityContainer>
  );
};

export default Page;
