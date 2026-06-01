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
    console.warn('[Mailer] SMTP credentials not configured — skipping email send.');
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

function buildRegistrationEmail({ customerName, extCode, serialNumber, type, capacityLiters, location, purchaseDate, expiryDate, daysToExpiry, complianceStatus }) {
  const complianceColor = { compliant: '#4ade80', warning: '#fbbf24', critical: '#fb923c', non_compliant: '#f87171' }[complianceStatus] || '#94a3b8';

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;border-radius:12px;overflow:hidden;">
    <div style="background:#22d3ee;padding:20px;text-align:center;">
      <h1 style="margin:0;color:#0a0f1e;font-size:20px;">🧯 Fire Extinguisher Registered</h1>
    </div>
    <div style="padding:30px;">
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>A fire extinguisher has been registered to your account in the FEMCS system.</p>
      <div style="background:#1e293b;border-radius:10px;padding:20px;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="color:#94a3b8;padding:6px 0;width:45%;">Extinguisher Code</td><td style="font-weight:bold;font-family:monospace;">${extCode}</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Serial Number</td><td style="font-weight:bold;font-family:monospace;">${serialNumber}</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Type</td><td style="font-weight:bold;">${type}</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Capacity</td><td style="font-weight:bold;">${capacityLiters} Liters</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Location</td><td style="font-weight:bold;">${location}</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Purchase Date</td><td style="font-weight:bold;">${new Date(purchaseDate).toLocaleDateString()}</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Expiry Date</td><td style="font-weight:bold;color:${complianceColor};">${new Date(expiryDate).toLocaleDateString()}</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Days Until Expiry</td><td style="font-weight:bold;color:${complianceColor};">${daysToExpiry} days</td></tr>
          <tr><td style="color:#94a3b8;padding:6px 0;">Compliance Status</td><td><span style="background:${complianceColor}22;color:${complianceColor};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold;">${complianceStatus.replace('_', ' ').toUpperCase()}</span></td></tr>
        </table>
      </div>
      <p>You will receive automatic reminders at <strong>90, 60, 30, and 7 days</strong> before expiry.</p>
      <p style="color:#64748b;font-size:12px;margin-top:30px;">This is an automated message from FEMCS. Do not reply to this email.</p>
    </div>
  </div>`;
}

module.exports = { sendEmail, buildRegistrationEmail };
