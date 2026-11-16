import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import type { ApprovalNotifier } from "../core/types.js";

export interface EmailNotifierConfig {
	smtpHost: string;
	smtpPort: number;
	smtpUser: string;
	smtpPass: string;
	fromAddress: string;
	toAddress: string;
	/** Base URL of the approval server, used for the approve and reject links. */
	approvalBaseUrl: string;
}

/** Sends the reviewer an e-mail with approve and reject links. */
export class EmailNotifier implements ApprovalNotifier {
	private readonly transporter: Transporter;

	constructor(
		private readonly config: EmailNotifierConfig,
		transporter?: Transporter,
	) {
		this.transporter =
			transporter ??
			nodemailer.createTransport({
				host: config.smtpHost,
				port: config.smtpPort,
				secure: config.smtpPort === 465,
				auth: { user: config.smtpUser, pass: config.smtpPass },
			});
	}

	async notify(request: {
		workflowId: string;
		message: string;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		const { workflowId, message, metadata } = request;
		const id = encodeURIComponent(workflowId);
		const base = this.config.approvalBaseUrl;
		const metadataHtml =
			metadata && Object.keys(metadata).length > 0
				? `<h3>Metadata</h3><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre>`
				: "";

		await this.transporter.sendMail({
			from: this.config.fromAddress,
			to: this.config.toAddress,
			subject: `Approval required: ${workflowId}`,
			html: `<h2>Workflow approval required</h2>
<p><strong>Workflow ID:</strong> ${escapeHtml(workflowId)}</p>
<h3>Draft</h3>
<div style="white-space:pre-wrap">${escapeHtml(message)}</div>
${metadataHtml}
<p><a href="${base}/approve/${id}">Approve</a> | <a href="${base}/reject/${id}">Reject</a></p>`,
		});
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
