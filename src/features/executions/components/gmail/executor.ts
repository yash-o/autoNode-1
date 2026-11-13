import { randomUUID } from "node:crypto";
import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import ky, { HTTPError } from "ky";
import {
  type GmailCredentialPayload,
  GmailOAuthError,
  refreshGmailAccessToken,
} from "@/features/credentials/lib/gmail-oauth";
import type { NodeExecutor } from "@/features/executions/types";
import { CredentialType } from "@/generated/prisma";
import { gmailChannel } from "@/inngest/channels/gmail";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type GmailData = {
  variableName?: string;
  credentialId?: string;
  fromName?: string;
  to?: string;
  subject?: string;
  body?: string;
};

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// Header values must not contain CR/LF, otherwise a variable could inject
// extra headers (e.g. Bcc) into the message.
const stripNewlines = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

// RFC 2047 encoded-word, so non-ASCII subjects and sender names survive.
const encodeHeaderValue = (value: string) =>
  `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

// RFC 2045 caps encoded lines at 76 characters.
const wrapBase64 = (value: string, width = 76) =>
  value.match(new RegExp(`.{1,${width}}`, "g"))?.join("\r\n") ?? "";

// A plain-text alternative is a strong deliverability signal: HTML-only
// messages are commonly scored as spam by content filters.
const htmlToText = (html: string) =>
  decode(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const buildRawMessage = ({
  from,
  to,
  subject,
  html,
  senderEmail,
}: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  senderEmail: string;
}) => {
  const boundary = `autonode_${randomUUID()}`;
  const domain = senderEmail.split("@")[1] || "localhost";
  const text = htmlToText(html) || " ";

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(text, "utf8").toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(html || " ", "utf8").toString("base64")),
    `--${boundary}--`,
  ];

  // Date and Message-ID are required headers per RFC 5322; omitting them is a
  // common spam-filter penalty.
  const mime = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    ...body,
  ].join("\r\n");

  return Buffer.from(mime, "utf8").toString("base64url");
};

export const gmailExecutor: NodeExecutor<GmailData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    gmailChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    if (!data.variableName) {
      throw new NonRetriableError("Gmail node: Variable name is missing");
    }

    const variableName = data.variableName;

    if (!data.credentialId) {
      throw new NonRetriableError("Gmail node: Credential is required");
    }

    const credentialId = data.credentialId;

    if (!data.to) {
      throw new NonRetriableError(
        "Gmail node: Recipient email (To) is required",
      );
    }

    if (!data.subject) {
      throw new NonRetriableError("Gmail node: Subject is required");
    }

    const recipients = decode(Handlebars.compile(data.to)(context))
      .split(",")
      .map((email) => stripNewlines(email))
      .filter(Boolean);

    if (recipients.length === 0) {
      throw new NonRetriableError(
        "Gmail node: Recipient email (To) is required",
      );
    }

    const subject = stripNewlines(
      decode(Handlebars.compile(data.subject)(context)),
    );
    const fromName = data.fromName
      ? stripNewlines(decode(Handlebars.compile(data.fromName)(context)))
      : "";
    const html = data.body
      ? decode(Handlebars.compile(data.body)(context))
      : "";

    const result = await step.run("gmail-send-email", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: credentialId, userId },
      });

      if (!credential || credential.type !== CredentialType.GMAIL) {
        throw new NonRetriableError("Gmail node: Credential not found");
      }

      let payload: GmailCredentialPayload;

      try {
        payload = JSON.parse(decrypt(credential.value));
      } catch {
        throw new NonRetriableError(
          "Gmail node: Credential is unreadable. Reconnect your Google account.",
        );
      }

      if (!payload.refreshToken || !payload.email) {
        throw new NonRetriableError(
          "Gmail node: Credential is missing a refresh token. Reconnect your Google account.",
        );
      }

      let accessToken: string;

      try {
        const token = await refreshGmailAccessToken(payload.refreshToken);
        accessToken = token.access_token;
      } catch (error) {
        const code =
          error instanceof GmailOAuthError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);

        // Retrying these cannot succeed — the credential needs attention.
        if (code === "invalid_grant") {
          throw new NonRetriableError(
            "Gmail node: Authorization was revoked or expired. Reconnect your Google account.",
          );
        }

        if (code === "unauthorized_client" || code === "invalid_client") {
          throw new NonRetriableError(
            "Gmail node: This credential was issued to a different OAuth client than the one this deployment is configured with. Reconnect the Google account from this deployment, or make GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET match the environment that connected it.",
          );
        }

        throw error;
      }

      const from = fromName
        ? `${encodeHeaderValue(fromName)} <${payload.email}>`
        : payload.email;

      const raw = buildRawMessage({
        from,
        to: recipients,
        subject,
        html,
        senderEmail: payload.email,
      });

      try {
        const response = await ky
          .post(GMAIL_SEND_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
            json: { raw },
          })
          .json<{ id: string; threadId: string }>();

        return {
          ...context,
          [variableName]: {
            messageId: response.id,
            threadId: response.threadId,
            from: payload.email,
            to: recipients,
            subject,
          },
        };
      } catch (error) {
        if (error instanceof HTTPError) {
          const status = error.response.status;
          const detail = await error.response.text().catch(() => "");

          if (status === 401 || status === 403) {
            throw new NonRetriableError(
              "Gmail node: Gmail rejected the credential. Reconnect your Google account.",
            );
          }

          if (status === 400) {
            throw new NonRetriableError(
              `Gmail node: Invalid message (${detail.slice(0, 300)})`,
            );
          }
        }

        throw error;
      }
    });

    await publish(
      gmailChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    await publish(
      gmailChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
