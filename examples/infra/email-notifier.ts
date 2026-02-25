import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailNotifierService } from './types.js';

export interface EmailNotifierConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  toAddress: string;
  approvalBaseUrl: string;
}

export class EmailNotifier implements EmailNotifierService {
  private transporter: Transporter;
  private config: EmailNotifierConfig;

  constructor(config: EmailNotifierConfig, transporter?: Transporter) {
    this.config = config;
    this.transporter = transporter ?? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });
  }

  async sendApproval(params: {
    workflowId: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { workflowId, message, metadata } = params;
    const approveUrl = `${this.config.approvalBaseUrl}/approve/${workflowId}`;
    const rejectUrl = `${this.config.approvalBaseUrl}/reject/${workflowId}`;

    const metadataHtml = metadata && Object.keys(metadata).length > 0
      ? `<h3>Metadata</h3><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre>`
      : '';

    const html = `
      <h2>Workflow Approval Required</h2>
      <p><strong>Workflow ID:</strong> ${escapeHtml(workflowId)}</p>
      <h3>Draft</h3>
      <div style="background:#f5f5f5;padding:16px;border-radius:4px;white-space:pre-wrap">${escapeHtml(message)}</div>
      ${metadataHtml}
      <br/>
      <p>
        <a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#22c55e;color:#fff;text-decoration:none;border-radius:4px;margin-right:8px">Approve</a>
        <a href="${rejectUrl}" style="display:inline-block;padding:12px 24px;background:#ef4444;color:#fff;text-decoration:none;border-radius:4px">Reject</a>
      </p>
    `.trim();

    await this.transporter.sendMail({
      from: this.config.fromAddress,
      to: this.config.toAddress,
      subject: `Approval Required: ${workflowId}`,
      html,
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
