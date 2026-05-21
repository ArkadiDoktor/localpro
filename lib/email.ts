import sgMail from "@sendgrid/mail";
import { pool } from "./db";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM = {
  email: "noreply@localpro.app",
  name: "LocalPro",
};

// ----------------------------------------------------------------
// Email templates
// ----------------------------------------------------------------

interface BookingConfirmationData {
  clientName: string;
  clientEmail: string;
  providerName: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  address: string;
  totalAmount: string;
  bookingId: string;
}

interface BookingReminderData {
  clientName: string;
  clientEmail: string;
  providerName: string;
  serviceDate: string;
  startTime: string;
  address: string;
}

interface ProviderBookingNotificationData {
  providerName: string;
  providerEmail: string;
  clientName: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  address: string;
  notes?: string;
  payout: string;
}

// ----------------------------------------------------------------
// Send functions
// ----------------------------------------------------------------

export async function sendBookingConfirmation(
  data: BookingConfirmationData,
  bookingId: string
) {
  const msg = {
    to: data.clientEmail,
    from: FROM,
    subject: `Booking Confirmed — ${data.providerName} on ${data.serviceDate}`,
    html: bookingConfirmationHtml(data),
    text: `Your booking with ${data.providerName} on ${data.serviceDate} at ${data.startTime} is confirmed. Total: ${data.totalAmount}`,
  };

  const [response] = await sgMail.send(msg);
  await logEmail({
    recipient: data.clientEmail,
    template: "booking_confirmation",
    subject: msg.subject,
    referenceId: bookingId,
    messageId: response.headers?.["x-message-id"] as string,
  });
}

export async function sendProviderBookingNotification(
  data: ProviderBookingNotificationData,
  bookingId: string
) {
  const msg = {
    to: data.providerEmail,
    from: FROM,
    subject: `New Booking Request from ${data.clientName}`,
    html: providerNotificationHtml(data),
    text: `New booking: ${data.clientName} on ${data.serviceDate} at ${data.startTime}. Payout: ${data.payout}`,
  };

  const [response] = await sgMail.send(msg);
  await logEmail({
    recipient: data.providerEmail,
    template: "provider_booking_notification",
    subject: msg.subject,
    referenceId: bookingId,
    messageId: response.headers?.["x-message-id"] as string,
  });
}

export async function sendBookingReminder(
  data: BookingReminderData,
  bookingId: string
) {
  const msg = {
    to: data.clientEmail,
    from: FROM,
    subject: `Reminder: ${data.providerName} tomorrow at ${data.startTime}`,
    html: reminderHtml(data),
    text: `Reminder: ${data.providerName} is coming tomorrow (${data.serviceDate}) at ${data.startTime} to ${data.address}.`,
  };

  const [response] = await sgMail.send(msg);
  await logEmail({
    recipient: data.clientEmail,
    template: "booking_reminder",
    subject: msg.subject,
    referenceId: bookingId,
    messageId: response.headers?.["x-message-id"] as string,
  });
}

// ----------------------------------------------------------------
// Audit log
// ----------------------------------------------------------------

async function logEmail({
  recipient,
  template,
  subject,
  referenceId,
  messageId,
}: {
  recipient: string;
  template: string;
  subject: string;
  referenceId: string;
  messageId?: string;
}) {
  await pool.query(
    `INSERT INTO email_log (recipient, template, subject, reference_id, message_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [recipient, template, subject, referenceId, messageId ?? null]
  );
}

// ----------------------------------------------------------------
// HTML templates (inline-styled for email clients)
// ----------------------------------------------------------------

function bookingConfirmationHtml(d: BookingConfirmationData) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; color: #111; background: #f9f9f9; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08);">
    <div style="background: #0f172a; padding: 28px 32px;">
      <h1 style="color: white; margin: 0; font-size: 22px;">✓ Booking Confirmed</h1>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px">Hi <strong>${d.clientName}</strong>,</p>
      <p>Your booking is confirmed. Here are the details:</p>
      <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #666; width: 140px;">Service Provider</td><td><strong>${d.providerName}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Date</td><td><strong>${d.serviceDate}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Time</td><td><strong>${d.startTime} – ${d.endTime}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Address</td><td>${d.address}</td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Total Paid</td><td><strong style="color: #16a34a;">${d.totalAmount}</strong></td></tr>
      </table>
      <p style="font-size: 13px; color: #888;">Booking ID: ${d.bookingId}</p>
    </div>
    <div style="background: #f1f5f9; padding: 16px 32px; font-size: 12px; color: #94a3b8;">
      LocalPro — Connecting you with trusted local professionals.
    </div>
  </div>
</body>
</html>`;
}

function providerNotificationHtml(d: ProviderBookingNotificationData) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; color: #111; background: #f9f9f9; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08);">
    <div style="background: #0f172a; padding: 28px 32px;">
      <h1 style="color: white; margin: 0; font-size: 22px;">📋 New Booking</h1>
    </div>
    <div style="padding: 32px;">
      <p>Hi <strong>${d.providerName}</strong>, you have a new booking!</p>
      <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #666; width: 120px;">Client</td><td><strong>${d.clientName}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Date</td><td><strong>${d.serviceDate}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Time</td><td><strong>${d.startTime} – ${d.endTime}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #666;">Location</td><td>${d.address}</td></tr>
        ${d.notes ? `<tr><td style="padding: 8px 0; color: #666;">Notes</td><td>${d.notes}</td></tr>` : ""}
        <tr><td style="padding: 8px 0; color: #666;">Your Payout</td><td><strong style="color: #16a34a;">${d.payout}</strong></td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; background: #0f172a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View in Dashboard</a>
    </div>
  </div>
</body>
</html>`;
}

function reminderHtml(d: BookingReminderData) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; color: #111; background: #f9f9f9; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08);">
    <div style="background: #0f172a; padding: 28px 32px;">
      <h1 style="color: white; margin: 0; font-size: 22px;">🔔 Tomorrow's Booking</h1>
    </div>
    <div style="padding: 32px;">
      <p>Hi <strong>${d.clientName}</strong>, just a reminder:</p>
      <p><strong>${d.providerName}</strong> is coming <strong>tomorrow (${d.serviceDate})</strong> at <strong>${d.startTime}</strong> to <strong>${d.address}</strong>.</p>
    </div>
  </div>
</body>
</html>`;
}
