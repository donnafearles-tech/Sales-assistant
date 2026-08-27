import { ShareFileItem, BatchClassificationItem } from '../types.ts';
import { logger } from '../utils/logger.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GeminiService {
    /**
     * Batch Classify Folder Content using full folder context via Server-side Gemini endpoint
     */
    async classifyFolderBatch(
        folderName: string,
        filesData: Array<{ item: ShareFileItem; base64: string; mimeType: string }>,
        maxRetries = 3
    ): Promise<BatchClassificationItem[]> {
        logger.info(`[GeminiService] Initiating strict batch classification for folder: "${folderName}" with ${filesData.length} files via server endpoint.`);

        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                logger.info(`[GeminiService] Executing batch query via /api/classify (Attempt ${i + 1}/${maxRetries})...`);

                const response = await fetch('/api/classify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        folderName,
                        filesData
                    })
                });

                if (!response.ok) {
                    const errBody = await response.json().catch(() => ({ error: `Server HTTP ${response.status}` }));
                    throw new Error(errBody.error || `Server classification failed with status ${response.status}`);
                }

                const results = (await response.json()) as BatchClassificationItem[];
                logger.info(`[GeminiService] Successfully received ${results.length} batch classification items.`, results);
                return results;

            } catch (error: any) {
                lastError = error;
                logger.warn(`[GeminiService] Error in batch classification (Attempt ${i + 1}):`, error);

                if (error.message && (error.message.includes('400') || error.message.includes('401') || error.message.includes('403'))) {
                    break;
                }
                if (i < maxRetries - 1) {
                    await delay(Math.pow(2, i) * 1000);
                }
            }
        }

        logger.error("[GeminiService] Batch classification failed after retries:", lastError);
        throw lastError || new Error("Batch folder classification failed.");
    }
}
