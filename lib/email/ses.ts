import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

type TicketEmailInput = {
  email: string;
  bookingId: string;
  movieTitle: string;
  theatreName: string;
  screenName: string;
  showTime: string;
  seatsByZone: Array<{ zone: string; seats: string[]; amount: number }>;
  totalAmount: number;
  ticketUrl?: string;
};

function sesConfig() {
  const region = process.env.AWS_REGION?.trim();
  const fromEmail = process.env.AWS_SES_FROM_EMAIL?.trim();
  if (!region || !fromEmail) return null;
  return { region, fromEmail };
}

function client(region: string) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  return new SESClient({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
  });
}

function textLines(lines: Array<string | false | null | undefined>) {
  return lines.filter(Boolean).join('\n');
}

export async function sendPublicLoginOtp(email: string, otp: string) {
  const config = sesConfig();
  if (!config) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[public-auth] AWS SES is not configured; OTP email was not sent.');
    }
    return { sent: false, reason: 'SES_NOT_CONFIGURED' as const };
  }

  await client(config.region).send(new SendEmailCommand({
    Source: config.fromEmail,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Your KSFDC booking verification code' },
      Body: {
        Text: {
          Data: textLines([
            `Your verification code is ${otp}.`,
            'It expires in 5 minutes.',
            'Do not share this code.'
          ])
        }
      }
    }
  }));
  return { sent: true as const };
}

export async function sendTicketConfirmationEmail(input: TicketEmailInput) {
  const config = sesConfig();
  if (!config) return { sent: false, reason: 'SES_NOT_CONFIGURED' as const };

  const seatLines = input.seatsByZone.map((group) => `${group.zone}: ${group.seats.join(', ')} - INR ${group.amount}`);
  await client(config.region).send(new SendEmailCommand({
    Source: config.fromEmail,
    Destination: { ToAddresses: [input.email] },
    Message: {
      Subject: { Data: 'Your movie ticket is confirmed' },
      Body: {
        Text: {
          Data: textLines([
            'Your movie ticket is confirmed.',
            '',
            `Booking ID: ${input.bookingId}`,
            `Movie: ${input.movieTitle}`,
            `Theatre: ${input.theatreName}`,
            `Screen: ${input.screenName}`,
            `Show time: ${input.showTime}`,
            '',
            ...seatLines,
            '',
            `Total paid: INR ${input.totalAmount}`,
            input.ticketUrl ? `Ticket link: ${input.ticketUrl}` : null
          ])
        }
      }
    }
  }));
  return { sent: true as const };
}
