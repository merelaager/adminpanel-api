import type { SentMessageInfo, Transport } from "nodemailer";
import type MailMessage from "nodemailer/lib/mailer/mail-message";

export interface MailgunTransportOptions {
  apiKey: string;
  domain: string;
  host: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_LENGTH = 500;

// Prevent log clutter.
const truncate = (text: string): string =>
  text.length > MAX_ERROR_BODY_LENGTH
    ? `${text.slice(0, MAX_ERROR_BODY_LENGTH)}…`
    : text;

export const createMailgunTransport = (
  options: MailgunTransportOptions,
): Transport => {
  const url = `https://${options.host}/v3/${options.domain}/messages.mime`;
  const authorization = `Basic ${Buffer.from(`api:${options.apiKey}`).toString("base64")}`;

  const post = async (
    form: FormData,
  ): Promise<{ ok: boolean; status: number; body: string }> => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: authorization },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Mailgun request failed: ${reason}`, { cause: err });
    }
  };

  const send = async (mail: MailMessage): Promise<SentMessageInfo> => {
    const envelope = mail.message.getEnvelope();
    const raw = await mail.message.build();

    // Mailgun delivers to the `to` fields.
    const form = new FormData();
    for (const recipient of envelope.to) {
      form.append("to", recipient);
    }
    form.append("message", new Blob([new Uint8Array(raw)]), "message.mime");

    const { ok, status, body } = await post(form);
    if (!ok) {
      throw new Error(
        `Mailgun rejected the message: ${status} ${truncate(body)}`,
      );
    }

    return {
      envelope,
      messageId: mail.message.messageId(),
      accepted: envelope.to,
      response: body,
    };
  };

  // For valid credentials, Mailgun returns 400 for missing fields.
  const verify = async (): Promise<true> => {
    const { status, body } = await post(new FormData());
    if (status !== 400) {
      throw new Error(
        `Mailgun verification failed: ${status} ${truncate(body)}`,
      );
    }
    return true;
  };

  return {
    name: "mailgun",
    version: "1.0.0",
    send(mail, callback) {
      send(mail).then((info) => callback(null, info), callback);
    },
    verify(callback?: (err: Error | null, success?: true) => void) {
      const result = verify();
      if (!callback) {
        return result;
      }
      result.then(() => callback(null, true), callback);
    },
  };
};
