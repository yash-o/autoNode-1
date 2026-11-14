"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CredentialType } from "@/generated/prisma";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import {
  useCreateCredential,
  useSuspenseCredential,
  useUpdateCredential,
} from "../hooks/use-credentials";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.nativeEnum(CredentialType),
  value: z.string().min(1, "API key is required"),
});

type FormValues = z.infer<typeof formSchema>;

const credentialTypeOptions = [
  {
    value: CredentialType.OPENAI,
    label: "OpenAI",
    logo: "/logos/openai.svg",
  },
  {
    value: CredentialType.ANTHROPIC,
    label: "Anthropic",
    logo: "/logos/anthropic.svg",
  },
  {
    value: CredentialType.GEMINI,
    label: "Gemini",
    logo: "/logos/gemini.svg",
  },
  {
    value: CredentialType.GMAIL,
    label: "Gmail",
    logo: "/logos/gmail.svg",
  },
];

const GMAIL_AUTHORIZE_URL = "/api/credentials/gmail/authorize";

const gmailErrorMessages: Record<string, string> = {
  not_configured:
    "Gmail OAuth is not configured on the server. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.",
  access_denied: "You cancelled the Google authorization.",
  invalid_request: "Google did not return an authorization code.",
  invalid_state:
    "The authorization link expired or was tampered with. Try again.",
  missing_refresh_token:
    "Google did not return a refresh token. Reconnect and make sure you approve offline access.",
  missing_scope:
    "The Gmail send permission was not granted. Reconnect and allow it.",
  exchange_failed:
    "Could not exchange the authorization code with Google. Try again.",
  redirect_uri_mismatch:
    "The redirect URI does not match Google Cloud. Add this deployment's /api/credentials/gmail/callback URL (exact scheme and host) to the OAuth client's Authorized redirect URIs.",
  invalid_scope: "Google rejected the requested Gmail scope.",
  invalid_client:
    "Google rejected the OAuth client id. Check GOOGLE_CLIENT_ID / GMAIL_CLIENT_ID.",
  unauthorized_client:
    "This OAuth client is not allowed to use this grant type.",
};

const GmailConnectPanel = () => (
  <div className="space-y-4 rounded-md border p-4">
    <div className="space-y-1">
      <p className="text-sm font-medium">Connect a Google account</p>
      <p className="text-sm text-muted-foreground">
        You'll be sent to Google to approve access. AutoNode only requests
        permission to send email — it cannot read your inbox.
      </p>
    </div>
    <Button asChild>
      <a href={GMAIL_AUTHORIZE_URL}>Connect Google Account</a>
    </Button>
  </div>
);

interface CredentialFormProps {
  initialData?: {
    id?: string;
    name: string;
    type: CredentialType;
    value: string;
  };
  gmailError?: string;
  gmailErrorDetail?: string;
}

export const CredentialForm = ({
  initialData,
  gmailError,
  gmailErrorDetail,
}: CredentialFormProps) => {
  const router = useRouter();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const { handleError, modal } = useUpgradeModal();

  const isEdit = !!initialData?.id;
  const isGmailEdit = isEdit && initialData?.type === CredentialType.GMAIL;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      type: CredentialType.OPENAI,
      value: "",
    },
  });

  const watchedType = form.watch("type");
  const isGmail = watchedType === CredentialType.GMAIL;

  const errorMessage = gmailError
    ? gmailErrorMessages[gmailError] ||
      `Google authorization failed (${gmailError}).`
    : undefined;

  const onSubmit = async (values: FormValues) => {
    if (isEdit && initialData?.id) {
      await updateCredential.mutateAsync({
        id: initialData.id,
        ...values,
      });
    } else {
      await createCredential.mutateAsync(values, {
        onSuccess: (data) => {
          router.push(`/credentials/${data.id}`);
        },
        onError: (error) => {
          handleError(error);
        },
      });
    }
  };

  if (isGmailEdit) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Gmail Account</CardTitle>
          <CardDescription>{initialData?.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This credential is managed by Google OAuth and cannot be edited
            directly. Reconnect to refresh the authorization.
          </p>
          <GmailConnectPanel />
          <Button type="button" variant="outline" asChild>
            <Link href="/credentials" prefetch>
              Back
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {modal}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>
            {isEdit ? "Edit Credential" : "Create Credential"}
          </CardTitle>
          <CardDescription>
            {isEdit
              ? "Update your API key or credential details"
              : "Add a new API key or credential to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{errorMessage}</p>
              {gmailErrorDetail && (
                <p className="mt-1 break-words text-xs opacity-80">
                  Google said: {gmailErrorDetail}
                </p>
              )}
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {!isGmail && (
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My API key" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {credentialTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Image
                                src={option.logo}
                                alt={option.label}
                                width={16}
                                height={16}
                              />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isGmail ? (
                <GmailConnectPanel />
              ) : (
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="sk-..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex gap-4">
                {!isGmail && (
                  <Button
                    type="submit"
                    disabled={
                      createCredential.isPending || updateCredential.isPending
                    }
                  >
                    {isEdit ? "Update" : "Create"}
                  </Button>
                )}
                <Button type="button" variant="outline" asChild>
                  <Link href="/credentials" prefetch>
                    Cancel
                  </Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
};

export const CredentialView = ({ credentialId }: { credentialId: string }) => {
  const { data: credential } = useSuspenseCredential(credentialId);

  return <CredentialForm initialData={credential} />;
};
