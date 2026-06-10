import { Injectable, Logger } from '@nestjs/common';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { parse } from 'csv-parse/sync';

export interface ExtractedAttachment {
    filename: string;
    mimeType: string;
    size: number;
    extractedText: string;
    metadata: {
        pages?: number;
        wordCount?: number;
        rowCount?: number;
        sheetCount?: number;
    };
}

@Injectable()
export class AttachmentExtractionService {
    private readonly logger = new Logger(AttachmentExtractionService.name);

    /**
     * Extract text content from an attachment based on its MIME type
     */
    async extractAttachment(
        filename: string,
        mimeType: string,
        content: Buffer,
    ): Promise<ExtractedAttachment> {
        try {
            const extractedText = await this.extractByType(mimeType, content, filename);
            const metadata = this.extractMetadata(mimeType, extractedText, content);

            return {
                filename,
                mimeType,
                size: content.length,
                extractedText,
                metadata,
            };
        } catch (error: any) {
            this.logger.error(`Failed to extract ${filename}: ${error.message}`);
            return {
                filename,
                mimeType,
                size: content.length,
                extractedText: `[Attachment: ${filename}] — Could not extract content.`,
                metadata: {},
            };
        }
    }

    /**
     * Extract text by MIME type
     */
    private async extractByType(
        mimeType: string,
        content: Buffer,
        filename: string,
    ): Promise<string> {
        const type = mimeType.toLowerCase();

        if (type.includes('pdf')) {
            return this.extractPDF(content);
        }
        if (type.includes('csv') || filename.endsWith('.csv')) {
            return this.extractCSV(content);
        }
        if (type.includes('excel') || type.includes('spreadsheet') || filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            return this.extractExcel(content);
        }
        if (type.includes('word') || filename.endsWith('.docx') || filename.endsWith('.doc')) {
            return this.extractWord(content);
        }
        if (type.includes('text') || filename.endsWith('.txt') || filename.endsWith('.md')) {
            return content.toString('utf-8');
        }
        if (type.includes('json') || filename.endsWith('.json')) {
            return this.extractJSON(content);
        }
        if (type.includes('image')) {
            return `[Image: ${filename}] — Image content. Use the download URL to view.`;
        }

        return `[Attachment: ${filename}] — Binary file (${mimeType}). Use the download URL to access.`;
    }

    /**
     * Extract text from PDF
     */
    private async extractPDF(content: Buffer): Promise<string> {
        try {
            const data = await pdfParse(content);
            return data.text || 'PDF content empty';
        } catch (error) {
            this.logger.error(`PDF extraction failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract data from CSV
     */
    private extractCSV(content: Buffer): string {
        try {
            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });
            return JSON.stringify(records, null, 2);
        } catch (error) {
            // Fallback: return as plain text
            return content.toString('utf-8');
        }
    }

    /**
     * Extract data from Excel
     */
    private extractExcel(content: Buffer): string {
        try {
            const workbook = XLSX.read(content, { type: 'buffer' });
            const result: Record<string, any[]> = {};

            workbook.SheetNames.forEach((sheetName) => {
                const sheet = workbook.Sheets[sheetName];
                result[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            });

            return JSON.stringify(result, null, 2);
        } catch (error) {
            return content.toString('utf-8');
        }
    }

    /**
     * Extract text from Word document
     */
    private async extractWord(content: Buffer): Promise<string> {
        try {
            const result = await mammoth.extractRawText({ buffer: content });
            return result.value || 'Word document empty';
        } catch (error) {
            return content.toString('utf-8');
        }
    }

    /**
     * Extract and pretty-print JSON
     */
    private extractJSON(content: Buffer): string {
        try {
            const parsed = JSON.parse(content.toString('utf-8'));
            return JSON.stringify(parsed, null, 2);
        } catch {
            return content.toString('utf-8');
        }
    }

    /**
     * Extract metadata from content
     */
    private extractMetadata(
        mimeType: string,
        extractedText: string,
        content: Buffer,
    ): { pages?: number; wordCount?: number; rowCount?: number; sheetCount?: number } {
        const metadata: any = {};
        const type = mimeType.toLowerCase();

        if (type.includes('pdf')) {
            // Approximate pages by word count (average 250 words per page)
            metadata.wordCount = extractedText.split(/\s+/).length;
            metadata.pages = Math.ceil(metadata.wordCount / 250);
        }
        if (type.includes('csv') || type.includes('excel')) {
            try {
                const lines = extractedText.split('\n').filter(l => l.trim());
                metadata.rowCount = lines.length;
            } catch {
                // ignore
            }
        }
        if (type.includes('word')) {
            metadata.wordCount = extractedText.split(/\s+/).length;
        }

        return metadata;
    }

    /**
     * Check if MIME type is extractable
     */
    isExtractable(mimeType: string, filename: string): boolean {
        const type = mimeType.toLowerCase();
        const name = filename.toLowerCase();
        
        const extractable = [
            'pdf', 'csv', 'excel', 'spreadsheet', 'word', 'text',
            'json', 'plain'
        ];

        return extractable.some(t => type.includes(t)) ||
            name.endsWith('.pdf') ||
            name.endsWith('.csv') ||
            name.endsWith('.xlsx') ||
            name.endsWith('.xls') ||
            name.endsWith('.docx') ||
            name.endsWith('.doc') ||
            name.endsWith('.txt') ||
            name.endsWith('.md') ||
            name.endsWith('.json');
    }
}
