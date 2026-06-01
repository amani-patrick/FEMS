const cron = require('node-cron');
const db = require('./db');
const { sendEmail, buildExpiryEmailHtml } = require('./mailer');

const EXPIRY_THRESHOLDS = [90, 60, 30, 7]; // days

async function checkExpiryAndNotify() {
  console.log('⏰ Running expiry check scheduler...');

  for (const days of EXPIRY_THRESHOLDS) {
    const result = await db.query(
      `SELECT e.id, e.extinguisher_code, e.serial_number, e.location, e.expiry_date,
              c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email,
              EXTRACT(DAY FROM (e.expiry_date::timestamp - NOW())) AS days_left
       FROM extinguishers e
       JOIN customers c ON c.id = e.customer_id
       WHERE e.status NOT IN ('decommissioned', 'expired')
         AND e.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
         AND e.expiry_date > NOW() + INTERVAL '${days - 1} days'
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.extinguisher_id = e.id
             AND n.type = 'expiry_alert'
             AND n.days_until_expiry = ${days}
             AND n.created_at > NOW() - INTERVAL '2 days'
         )`,
      []
    );

    for (const row of result.rows) {
      const daysLeft = Math.ceil(parseFloat(row.days_left));
      const title = `Expiry Alert: ${row.extinguisher_code} expires in ${daysLeft} days`;
      const message = `Fire extinguisher ${row.extinguisher_code} (S/N: ${row.serial_number}) at ${row.location} will expire on ${new Date(row.expiry_date).toLocaleDateString()}. ${daysLeft} days remaining.`;

      // Create in-app notification for all admin/safety_officer users
      const adminUsers = await db.query(
        `SELECT id FROM users WHERE role IN ('admin', 'safety_officer') AND is_active = true`
      );

      for (const user of adminUsers.rows) {
        await db.query(
          `INSERT INTO notifications (customer_id, extinguisher_id, user_id, type, title, message, days_until_expiry, recipient_email)
           VALUES ($1,$2,$3,'expiry_alert',$4,$5,$6,$7)`,
          [row.customer_id, row.id, user.id, title, message, daysLeft, row.customer_email]
        );
      }

      // Send email to customer if they have an email
      if (row.customer_email) {
        try {
          const html = buildExpiryEmailHtml({
            customerName: row.customer_name,
            extCode: row.extinguisher_code,
            serialNumber: row.serial_number,
            location: row.location,
            expiryDate: new Date(row.expiry_date).toLocaleDateString(),
            daysLeft,
          });
          await sendEmail({ to: row.customer_email, subject: `[FEMCS] ${title}`, html });
          await db.query(
            `UPDATE notifications SET email_sent = true, email_sent_at = NOW()
             WHERE extinguisher_id = $1 AND type = 'expiry_alert' AND days_until_expiry = $2
               AND created_at > NOW() - INTERVAL '1 minute'`,
            [row.id, daysLeft]
          );
        } catch (err) {
          console.error('Email send failed:', err.message);
        }
      }

      console.log(`📧 Notification created for ${row.extinguisher_code} (${daysLeft} days to expiry)`);
    }
  }

  // Mark expired extinguishers
  await db.query(
    `UPDATE extinguishers SET status = 'expired', compliance_status = 'non_compliant'
     WHERE expiry_date < NOW() AND status NOT IN ('decommissioned', 'expired')`
  );
}

async function checkEscalations() {
  console.log('⚠️  Running escalation check...');

  // Find extinguishers that are expired and have no recent escalation
  const expired = await db.query(`
    SELECT e.id, e.extinguisher_code, e.expiry_date,
           c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email,
           COALESCE(MAX(esc.stage), 0) AS current_stage
    FROM extinguishers e
    JOIN customers c ON c.id = e.customer_id
    LEFT JOIN escalations esc ON esc.extinguisher_id = e.id AND esc.status = 'open'
    WHERE e.status = 'expired'
    GROUP BY e.id, e.extinguisher_code, e.expiry_date, c.id, c.full_name, c.email
    HAVING COALESCE(MAX(esc.stage), 0) < 5
  `);

  for (const row of expired.rows) {
    const nextStage = row.current_stage + 1;
    const stageMessages = {
      1: 'Reminder: Your fire extinguisher has expired. Please take immediate action.',
      2: 'URGENT WARNING: Expired extinguisher poses a safety risk. Immediate replacement required.',
      3: 'SAFETY OFFICER ALERT: Compliance violation detected. Escalated to safety officer.',
      4: 'REGULATORY NOTICE: This case has been escalated to the regulatory authority.',
      5: 'COMPLIANCE CASE CREATED: A formal compliance case has been opened for this violation.',
    };

    await db.query(
      `INSERT INTO escalations (extinguisher_id, customer_id, stage, reason)
       VALUES ($1,$2,$3,$4)`,
      [row.id, row.customer_id, nextStage, stageMessages[nextStage]]
    );

    // In-app notification for admins
    const adminUsers = await db.query(
      `SELECT id FROM users WHERE role IN ('admin', 'safety_officer') AND is_active = true`
    );
    for (const user of adminUsers.rows) {
      await db.query(
        `INSERT INTO notifications (customer_id, extinguisher_id, user_id, type, title, message, escalation_stage)
         VALUES ($1,$2,$3,'escalation',$4,$5,$6)`,
        [row.customer_id, row.id, user.id,
          `Escalation Stage ${nextStage}: ${row.extinguisher_code}`,
          stageMessages[nextStage], nextStage]
      );
    }

    console.log(`🚨 Escalation stage ${nextStage} created for ${row.extinguisher_code}`);
  }
}

function startScheduler() {
  // Run expiry check every day at 8:00 AM
  cron.schedule('0 8 * * *', checkExpiryAndNotify);
  // Run escalation check every day at 9:00 AM
  cron.schedule('0 9 * * *', checkEscalations);

  console.log('📅 Notification scheduler started (daily at 8AM & 9AM)');

  // Run immediately on startup in development
  if (process.env.NODE_ENV === 'development') {
    setTimeout(checkExpiryAndNotify, 3000);
  }
}

module.exports = { startScheduler, checkExpiryAndNotify, checkEscalations };
