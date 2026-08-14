export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailAdapter {
  send(email: OutgoingEmail): Promise<void>;
}
