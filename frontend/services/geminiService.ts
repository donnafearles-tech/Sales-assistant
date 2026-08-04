import { GoogleGenAI, Type } from '@google/genai';
import { logger } from '../utils/logger.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GeminiService {
    private ai: GoogleGenAI;

    constructor() {
        // Initialize with the API key from the environment and enable Vertex AI
        // The prompt states this is a hard requirement and handled externally.
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY, vertexai: true });
        logger.info("[GeminiService] Initialized GoogleGenAI client with Vertex AI.");
    }

    /**
     * Analyzes an image and returns a suggested category name, extracted invoice number, VIP status, store name, and invoice type.
     */
    async analyzeImageContent(base64Data: string, mimeType: string, maxRetries = 3): Promise<{category: string, invoiceNumber: string, isCustomerVip: boolean, storeName: string, isProductInvoice: boolean}> {
        const prompt = `
        You are an AI assistant helping a salesperson categorize images and extract data from receipts and invoices.
        Look at this image carefully.
        1. Determine its primary content category (e.g., 'Product', 'Receipt', 'ID_Card', 'Contract', 'Store_Front', 'Document', 'Signature'). Use max 2 words, separated by underscores.
        2. Extract the invoice number, receipt number, or order number if visible in the document (e.g., "Invoice #: 166510" -> "166510"). If you cannot find any identifying number, return 'NO_INVOICE'.
        3. Check if the exact phrase "customer vip" or "vip customer" (case-insensitive) appears anywhere in the document text. Return true if it does, false otherwise.
        4. Extract the store name or company name at the top of the receipt (e.g., 'Royal Bee Terminal 3 Cancun', 'Morena Mia Beauty Group'). Return 'UNKNOWN_STORE' if not found.
        5. Determine if this document is a standard product invoice or receipt (contains a list of purchased products, quantities, and prices). Return true if it is.
        `;

        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                logger.info(`[GeminiService] Analyzing image content (Attempt ${i + 1}/${maxRetries})`, { mimeType });
                const response = await this.ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    data: base64Data,
                                    mimeType: mimeType,
                                },
                            },
                            {
                                text: prompt,
                            },
                        ],
                    },
                    config: {
                        temperature: 0.1, // Low temperature for more deterministic extraction
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                category: {
                                    type: Type.STRING,
                                    description: 'The category of the image, max 2 words with underscores.'
                                },
                                invoiceNumber: {
                                    type: Type.STRING,
                                    description: 'The extracted invoice or receipt number. NO_INVOICE if none found.'
                                },
                                isCustomerVip: {
                                    type: Type.BOOLEAN,
                                    description: 'True if the text "customer vip" or "vip customer" is found in the image.'
                                },
                                storeName: {
                                    type: Type.STRING,
                                    description: 'The name of the store or company at the top of the receipt. UNKNOWN_STORE if not found.'
                                },
                                isProductInvoice: {
                                    type: Type.BOOLEAN,
                                    description: 'True if the document is a receipt or invoice listing purchased products and prices.'
                                }
                            },
                            required: ['category', 'invoiceNumber', 'isCustomerVip', 'storeName', 'isProductInvoice']
                        }
                    }
                });

                const resultText = response.text?.trim() || '{}';
                const result = JSON.parse(resultText);
                
                let category = result.category || 'Image';
                let invoiceNumber = result.invoiceNumber || 'NO_INVOICE';
                let isCustomerVip = !!result.isCustomerVip;
                let storeName = result.storeName || 'UNKNOWN_STORE';
                let isProductInvoice = !!result.isProductInvoice;
                
                // Clean up the response just in case
                category = category.replace(/[^a-zA-Z0-9_]/g, '');
                invoiceNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '');
                
                if (!category) category = 'Image';
                if (!invoiceNumber) invoiceNumber = 'NO_INVOICE';

                logger.info(`[GeminiService] Successfully analyzed image: Category=${category}, Invoice=${invoiceNumber}, isCustomerVip=${isCustomerVip}, Store=${storeName}, isProductInvoice=${isProductInvoice}`);
                return { category, invoiceNumber, isCustomerVip, storeName, isProductInvoice };
            } catch (error: any) {
                lastError = error;
                logger.warn(`[GeminiService] Error analyzing image (Attempt ${i + 1})`, error);
                
                // Check if it's a 4xx error that shouldn't be retried (except 429)
                if (error.status >= 400 && error.status < 500 && error.status !== 429) {
                    break;
                }
                if (i < maxRetries - 1) {
                    await delay(Math.pow(2, i) * 1000);
                }
            }
        }
        
        logger.error("[GeminiService] Error analyzing image with Gemini after retries:", lastError);
        return { category: 'Uncategorized', invoiceNumber: 'ERROR', isCustomerVip: false, storeName: 'UNKNOWN_STORE', isProductInvoice: false }; // Fallback
    }
}
