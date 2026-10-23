async function sendApprovalRequest({ name, email, approvalUrl }) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL || !process.env.EMAIL_FROM) {
    throw new Error("Email is not configured. Set RESEND_API_KEY, ADMIN_EMAIL, and EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [process.env.ADMIN_EMAIL],
      subject: "Account approval requested",
      text: `A user requested an account.\n\nName: ${name}\nEmail: ${email}\n\nReview and approve: ${approvalUrl}\n\nThis link is single-use and expires in 24 hours.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171a18"><h2>Account approval requested</h2><p>A user requested access to Nexus Coding Club elections.</p><p><strong>Name:</strong> ${escapeHtml(name)}<br><strong>Email:</strong> ${escapeHtml(email)}</p><p><a href="${escapeHtml(approvalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#39865b;color:#fff;text-decoration:none;font-weight:bold">Approve User</a></p><p>This single-use link expires in 24 hours.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Could not send approval email (Resend returned ${response.status}).`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

module.exports = { sendApprovalRequest };
