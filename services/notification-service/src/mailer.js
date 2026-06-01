const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Email credentials not configured. Skipping email send.');
    return { skipped: true };
  }
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'FEMCS System <noreply@femcs.rw>',
    to,
    subject,
    html,
  });
  return info;
}

function buildExpiryEmailHtml({ customerName, extCode, serialNumber, location, expiryDate, daysLeft, stage }) {
  const urgencyColor = daysLeft <= 7 ? '#f87171' : daysLeft <= 30 ? '#fbbf24' : '#22d3ee';
  const urgencyLabel = daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 30 ? 'URGENT' : 'WARNING';

  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f1f5f9; border-radius: 12px; overflow: hidden;">
    <div style="background: ${urgencyColor}; padding: 20px; text-align: center;">
      <h1 style="margin: 0; color: #0a0f1e; font-size: 22px;">🧯 FEMCS - ${urgencyLabel} ALERT</h1>
    </div>
    <div style="padding: 30px;">
      <p style="font-size: 16px;">Dear <strong>${customerName}</strong>,</p>
      <p>This is an automated compliance alert regarding your fire extinguisher.</p>
      <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="color: #94a3b8; padding: 6px 0;">Extinguisher Code</td><td style="font-weight: bold;">${extCode}</td></tr>
          <tr><td style="color: #94a3b8; padding: 6px 0;">Serial Number</td><td style="font-weight: bold;">${serialNumber}</td></tr>
          <tr><td style="color: #94a3b8; padding: 6px 0;">Location</td><td style="font-weight: bold;">${location}</td></tr>
          <tr><td style="color: #94a3b8; padding: 6px 0;">Expiry Date</td><td style="font-weight: bold; color: ${urgencyColor};">${expiryDate}</td></tr>
          <tr><td style="color: #94a3b8; padding: 6px 0;">Days Remaining</td><td style="font-weight: bold; color: ${urgencyColor};">${daysLeft} days</td></tr>
          ${stage ? `<tr><td style="color: #94a3b8; padding: 6px 0;">Escalation Stage</td><td style="font-weight: bold; color: #f87171;">Stage ${stage}</td></tr>` : ''}
        </table>
      </div>
      <p>Please take immediate action to renew or replace this extinguisher to maintain fire safety compliance.</p>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">This is an automated message from the Fire Extinguisher Management and Compliance System (FEMCS). Do not reply to this email.</p>
    </div>
  </div>`;
}

module.exports = { sendEmail, buildExpiryEmailHtml };
