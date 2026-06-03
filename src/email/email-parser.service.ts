/**
 * Email parsing service
 * Parses raw email content using postal-mime
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ParsedEmail {
  from?: {
    address: string;
    name?: string;
  };
  to: Array<{ address?: string; name?: string }>;
  cc?: Array<{ address?: string; name?: string }>;
  bcc?: Array<{ address?: string; name?: string }>;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  date?: string;
  headers: Array<{ key: string; value: string }>;
  attachments?: Array<{
    filename?: string;
    mimeType: string;
    content: Buffer | string;
    contentId?: string;
    disposition?: string;
    size: number;
  }>;
}

@Injectable()
export class EmailParserService {
  private readonly logger = new Logger(EmailParserService.name);

  /**
   * Parse raw email buffer using postal-mime
   */
  async parseEmail(rawEmail: Buffer): Promise<ParsedEmail> {
    try {
      // Dynamic import to handle potential module issues
      const PostalMime = (await import('postal-mime')).default;
      const parser = new PostalMime();
      const parsed = await parser.parse(rawEmail);

      return {
        from: parsed.from
          ? {
              address: parsed.from.address || '',
              name: parsed.from.name,
            }
          : undefined,
        to: (parsed.to || []).map((t: any) => ({
          address: t.address,
          name: t.name,
        })),
        cc: parsed.cc?.map((c: any) => ({
          address: c.address,
          name: c.name,
        })),
        bcc: parsed.bcc?.map((b: any) => ({
          address: b.address,
          name: b.name,
        })),
        subject: parsed.subject || '',
        text: parsed.text,
        html: parsed.html,
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        date: parsed.date,
        headers: (parsed.headers || []).map((h: any) => ({
          key: h.key,
          value: h.value,
        })),
        attachments: (parsed.attachments || []).map((att: any) => ({
          filename: att.filename,
          mimeType: att.mimeType,
          content: att.content,
          contentId: att.contentId,
          disposition: att.disposition,
          size: typeof att.content === 'string' ? att.content.length : att.content?.byteLength || 0,
        })),
      };
    } catch (error: any) {
      this.logger.error(`Failed to parse email: ${error.message}`);
      throw new Error(`Email parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract all recipient addresses from parsed email
   */
  extractRecipients(parsed: ParsedEmail): {
    to: string[];
    cc: string[];
    bcc: string[];
    all: string[];
  } {
    const to = parsed.to?.map((t) => t.address?.toLowerCase()).filter(Boolean) as string[] || [];
    const cc = parsed.cc?.map((c) => c.address?.toLowerCase()).filter(Boolean) as string[] || [];
    const bcc = parsed.bcc?.map((b) => b.address?.toLowerCase()).filter(Boolean) as string[] || [];

    return {
      to,
      cc,
      bcc,
      all: [...new Set([...to, ...cc, ...bcc])],
    };
  }

  /**
   * Find the inbox email address from recipients
   */
  findInboxAddress(recipients: string[], allowedAddresses: string[]): string | null {
    if (allowedAddresses.length > 0) {
      const matched = recipients.find((addr) =>
        allowedAddresses.includes(addr.toLowerCase()),
      );
      return matched || null;
    }
    return recipients[0] || null;
  }

  /**
   * Extract Message-ID from header value
   */
  extractMsgId(value: string): string | null {
    const match = value.match(/<([^>]+)>/);
    return match ? match[1] : value.trim().split(/\s+/)[0] || null;
  }

  /**
   * Build References array from parsed email
   */
  buildReferences(parsed: ParsedEmail): string[] {
    if (parsed.references) {
      return parsed.references
        .split(/\s+/)
        .filter(Boolean)
        .map((ref) => this.extractMsgId(ref))
        .filter(Boolean) as string[];
    }
    return [];
  }
}
