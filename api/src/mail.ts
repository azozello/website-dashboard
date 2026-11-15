import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** Development only (no SMTP_URL): the most recent messages, newest last. */
  outbox: Mail[];
}

/** SMTP when SMTP_URL is set; otherwise prints each message to the log (development and tests). */
export function createMailer(smtpUrl: string | undefined, from: string, log: Pick<Console, 'info'> = console): Mailer {
  const outbox: Mail[] = [];
  if (!smtpUrl) {
    return {
      outbox,
      async send(mail) {
        outbox.push(mail);
        if (outbox.length > 50) outbox.shift();
        log.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n`);
      },
    };
  }
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    outbox,
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}
