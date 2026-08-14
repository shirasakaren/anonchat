import { Resend } from "resend";
import type { EmailAdapter, OutgoingEmail } from "./types.js";

export class ResendEmailAdapter implements EmailAdapter {
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(email: OutgoingEmail): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (result.error) {
      throw new Error(`Resend email failed: ${result.error.message}`);
    }
  }
}
