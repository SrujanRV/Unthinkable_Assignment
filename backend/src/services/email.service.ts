import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

// Helper to initialize the transporter
const getTransporter = async (): Promise<nodemailer.Transporter> => {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    console.log('[Email] Using custom SMTP configuration:', smtpHost);
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  } else {
    console.log('[Email] No SMTP credentials found. Creating an Ethereal test account...');
    try {
      // 3-second max timeout for Ethereal account creation to prevent blocking HTTP checkouts on cloud instances
      const testAccountPromise = nodemailer.createTestAccount();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Ethereal test account creation timed out')), 3000)
      );

      const testAccount = await Promise.race([testAccountPromise, timeoutPromise]);
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('[Email] Ethereal test account created successfully:', testAccount.user);
    } catch (err: any) {
      console.warn('[Email] Ethereal account creation unavailable/timed out, using console fallback:', err?.message || err);
      // Fallback transporter that logs to console
      transporter = {
        sendMail: async (options: any) => {
          console.log('\n==================================================');
          console.log('[FALLBACK EMAIL SENDER] Ticket Email Sent');
          console.log(`To: ${options.to}`);
          console.log(`Subject: ${options.subject}`);
          console.log('==================================================\n');
          return { messageId: 'console-fallback-id' };
        },
      } as any;
    }
  }

  return transporter!;
};

interface SendTicketEmailArgs {
  to: string;
  bookingReference: string;
  eventTitle: string;
  venueName: string;
  venueLocation: string;
  startTime: string;
  seats: string[];
  totalPrice: number;
  qrCodeDataUrl: string; // Base64 data URL
}

export const sendTicketEmail = async (args: SendTicketEmailArgs): Promise<string | null> => {
  try {
    const client = await getTransporter();

    // Convert data URL (data:image/png;base64,iVBOR...) into a buffer for attachments
    const base64Data = args.qrCodeDataUrl.split(',')[1];
    const qrBuffer = Buffer.from(base64Data, 'base64');

    const mailOptions = {
      from: '"Grabaseat" <noreply@grabaseat.com>',
      to: args.to,
      subject: `🎟️ Your Tickets for ${args.eventTitle} (Ref: ${args.bookingReference})`,
      text: `Hello,\n\nYour booking is confirmed! Reference: ${args.bookingReference}\nEvent: ${args.eventTitle}\nVenue: ${args.venueName}\nSeats: ${args.seats.join(', ')}\nTotal: $${args.totalPrice.toFixed(2)}\nShowtime: ${new Date(args.startTime).toLocaleString()}\n\nScan the attached QR code at the entrance.\n\nThanks for booking with Grabaseat!`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1)">
          <div style="background-color: #312e81; padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Booking Confirmed!</h1>
            <p style="margin: 4px 0 0 0; color: #c7d2fe; font-size: 14px;">Booking Reference: <strong>${args.bookingReference}</strong></p>
          </div>
          <div style="padding: 24px; background-color: #ffffff; color: #1f2937;">
            <h2 style="margin-top: 0; color: #312e81;">${args.eventTitle}</h2>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <table style="width: 100%; font-size: 14px; line-height: 1.6;">
              <tr>
                <td style="color: #6b7280; font-weight: bold; width: 30%;">Venue:</td>
                <td><strong>${args.venueName}</strong> (${args.venueLocation})</td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-weight: bold;">Date &amp; Time:</td>
                <td>${new Date(args.startTime).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-weight: bold;">Seats:</td>
                <td><span style="background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${args.seats.join(', ')}</span></td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-weight: bold;">Amount Paid:</td>
                <td style="color: #059669; font-weight: bold; font-size: 16px;">$${args.totalPrice.toFixed(2)}</td>
              </tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <div style="text-align: center;">
              <p style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">Scan the QR code below at the venue entrance:</p>
              <img src="cid:ticket-qrcode" alt="Booking QR Code" style="border: 4px solid #f3f4f6; border-radius: 8px; width: 180px; height: 180px;" />
            </div>
          </div>
          <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #6b7280;">
            Thank you for booking with <strong>Grabaseat</strong>!
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'ticket-qrcode.png',
          content: qrBuffer,
          cid: 'ticket-qrcode', // inline image reference matching src="cid:ticket-qrcode"
        },
      ],
    };

    const info = await client.sendMail(mailOptions);
    console.log('[Email] Email sent successfully, messageId:', info.messageId);

    // If using ethereal test account, log preview URL
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📬 [Email Ethereal Preview URL]:', previewUrl);
      return previewUrl;
    }

    return null;
  } catch (error) {
    console.error('[Email] Failed to send ticket confirmation email:', error);
    return null;
  }
};

export const sendEventCancellationEmail = async (args: {
  to: string;
  bookingReference: string;
  eventTitle: string;
  startTime: string;
  seats: string[];
  refundAmount: number;
}): Promise<string | null> => {
  try {
    const client = await getTransporter();

    const mailOptions = {
      from: '"Grabaseat" <noreply@grabaseat.com>',
      to: args.to,
      subject: `⚠️ IMPORTANT: Event Cancelled - ${args.eventTitle} (Ref: ${args.bookingReference})`,
      text: `Hello,\n\nWe regret to inform you that the event "${args.eventTitle}" scheduled for ${new Date(args.startTime).toLocaleString()} has been cancelled by the organiser.\n\nYour booking (Reference: ${args.bookingReference}) for seats ${args.seats.join(', ')} has been cancelled. A refund of $${args.refundAmount.toFixed(2)} is being processed.\n\nWe apologize for the inconvenience.`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1)">
          <div style="background-color: #991b1b; padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Event Cancelled</h1>
            <p style="margin: 4px 0 0 0; color: #fecaca; font-size: 14px;">Booking Reference: <strong>${args.bookingReference}</strong></p>
          </div>
          <div style="padding: 24px; background-color: #ffffff; color: #1f2937;">
            <h2 style="margin-top: 0; color: #991b1b;">Cancellation Notice</h2>
            <p>Dear customer,</p>
            <p>We regret to inform you that the event <strong>${args.eventTitle}</strong> has been <strong>cancelled by the organiser</strong>.</p>
            <p>Consequently, your booking has been cancelled and a full refund of <strong>$${args.refundAmount.toFixed(2)}</strong> is being issued.</p>
            <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 16px 0;" />
            <table style="width: 100%; font-size: 14px; line-height: 1.6;">
              <tr>
                <td style="color: #6b7280; font-weight: bold; width: 30%;">Event:</td>
                <td><strong>${args.eventTitle}</strong></td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-weight: bold;">Original Date:</td>
                <td>${new Date(args.startTime).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-weight: bold;">Cancelled Seats:</td>
                <td><span style="background-color: #fef2f2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${args.seats.join(', ')}</span></td>
              </tr>
              <tr>
                <td style="color: #6b7280; font-weight: bold;">Refund Amount:</td>
                <td style="color: #b91c1c; font-weight: bold; font-size: 16px;">$${args.refundAmount.toFixed(2)}</td>
              </tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 24px 0;" />
            <p style="font-size: 13px; color: #4b5563;">If you have any questions, please contact the event organiser directly. We apologize for any inconvenience caused.</p>
          </div>
          <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #fee2e2; font-size: 12px; color: #6b7280;">
            Grabaseat Support — We're sorry for the inconvenience.
          </div>
        </div>
      `,
    };

    const info = await client.sendMail(mailOptions);
    console.log('[Email] Cancellation email sent successfully, messageId:', info.messageId);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📬 [Email Ethereal Preview URL]:', previewUrl);
      return previewUrl;
    }
    return null;
  } catch (error) {
    console.error('[Email] Failed to send cancellation email:', error);
    return null;
  }
};
