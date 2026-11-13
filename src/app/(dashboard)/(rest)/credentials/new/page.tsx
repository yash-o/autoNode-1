import { CredentialForm } from "@/features/credentials/components/credential";
import { requireAuth } from "@/lib/auth-utils";

type Props = {
  searchParams: Promise<{ gmailError?: string; gmailErrorDetail?: string }>;
};

const Page = async ({ searchParams }: Props) => {
  await requireAuth();

  const { gmailError, gmailErrorDetail } = await searchParams;

  return (
    <div className="p-4 md:px-10 md:py-6 h-full">
      <div className="mx-auto max-w-screen-md w-full flex flex-col gap-y-8 h-full">
        <CredentialForm
          gmailError={gmailError}
          gmailErrorDetail={gmailErrorDetail}
        />
      </div>
    </div>
  );
};

export default Page;
