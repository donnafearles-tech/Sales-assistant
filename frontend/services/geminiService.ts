import { GoogleGenAI, Type } from '@google/genai';
import { logger } from '../utils/logger.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface DocumentAnalysisResult {
    documentType: 'PRODUCT_INVOICE' | 'TRANSACTION_RECEIPT' | 'IDENTIFICATION' | 'CRUISE_CARD' | 'SHIPPING_INFO' | 'RETURN_NOTE' | 'OTHER';
    storeAbbreviation: string;
    invoiceNumber: string | null;
    customerLastName: string | null;
    suggestedName: string;
    suffix: string;
    originalNameRemoved: boolean;
    confidence: number;
}

export class GeminiService {
    private ai: GoogleGenAI;

    constructor() {
        // Initialize GoogleGenAI SDK with Vertex AI.
        // ADC (Application Default Credentials) / process.env.API_KEY is used.
        const apiKey = process.env.API_KEY || '';
        this.ai = new GoogleGenAI({ apiKey, vertexai: true });
        logger.info("[GeminiService] Initialized GoogleGenAI client with Vertex AI.");
    }

    /**
     * Analyzes an image and returns strict document classification and structured naming details.
     */
    async analyzeImageContent(base64Data: string, mimeType: string, maxRetries = 3): Promise<DocumentAnalysisResult> {
        const prompt = `
        You are an expert Document Organization Assistant for a sales team.
        Analyze this image carefully and classify it into one of the following DOCUMENT TYPES:

        1. PRODUCT_INVOICE: Ticket, invoice, or receipt listing purchased products, quantities, and prices.
        2. TRANSACTION_RECEIPT: Bank card voucher, credit card slip, merchant receipt, or payment authorization.
        3. RETURN_NOTE: Refund, exchange, return receipt, or credit note.
        4. IDENTIFICATION: Passport, Driver's License, ID Card, State ID.
        5. CRUISE_CARD: Cruise ship keycard, cabin card, Crown & Anchor card, SeaPass.
        6. SHIPPING_INFO: Shipping label, delivery form, address form, tracking slip.
        7. OTHER: Any other document type (contracts, photos, storefronts).

        STORE NAME ABBREVIATION RULES:
        - "Royal Bee Terminal 3 Cancun" -> "RoyalBeeT3"
        - "Earth Palapa" -> "EarthPalapa"
        - "Morena Mia Beauty Group" -> "MorenaMia"
        - Any other store: abbreviate to recognizable CamelCase name (max 15 chars)

        NAMING FORMAT & SUFFIX RULES:
        - PRODUCT_INVOICE: [StoreAbbr]_[Invoice#]_N (Example: RoyalBeeT3_166422_N)
        - TRANSACTION_RECEIPT: [StoreAbbr]_[Invoice#]_V (Example: RoyalBeeT3_166422_V)
        - RETURN_NOTE: [StoreAbbr]_[Invoice#]_R (Example: EarthPalapa_193671_R)
        - IDENTIFICATION: [StoreAbbr]_[LastName]_ID (Example: EarthPalapa_Bryant_ID)
        - CRUISE_CARD: [StoreAbbr]_[LastName]_CROWN (Example: EarthPalapa_Bryant_CROWN)
        - SHIPPING_INFO: [StoreAbbr]_[LastName]_SHIPPING (Example: EarthPalapa_Bryant_SHIPPING)
        - OTHER: [StoreAbbr]_[description] (Example: EarthPalapa_contract)

        CRITICAL REQUIREMENT:
        - Store abbreviation ALWAYS goes FIRST.
        - COMPLETELY ERASE the original filename.
        - Return ONLY JSON matching the provided schema.
        `;

        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                logger.info(`[GeminiService] Analyzing image content with Vertex AI (Attempt ${i + 1}/${maxRetries})`, { mimeType });
                
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
                        temperature: 0.1, // Low temperature for deterministic analysis
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                documentType: {
                                    type: Type.STRING,
                                    description: 'Document classification type.',
                                },
                                storeAbbreviation: {
                                    type: Type.STRING,
                                    description: 'Abbreviated store name (e.g., RoyalBeeT3, EarthPalapa, MorenaMia).',
                                },
                                invoiceNumber: {
                                    type: Type.STRING,
                                    description: 'Extracted invoice, ticket, or transaction number (or null if not found).',
                                },
                                customerLastName: {
                                    type: Type.STRING,
                                    description: 'Extracted customer last name (or null if not found).',
                                },
                                suggestedName: {
                                    type: Type.STRING,
                                    description: 'The complete new filename WITHOUT extension following strict rules.',
                                },
                                suffix: {
                                    type: Type.STRING,
                                    description: 'Suffix code used (N, V, R, ID, CROWN, SHIPPING, OTHER).',
                                },
                                originalNameRemoved: {
                                    type: Type.BOOLEAN,
                                    description: 'Must be true to confirm original filename was erased.',
                                },
                                confidence: {
                                    type: Type.NUMBER,
                                    description: 'Confidence score between 0.0 and 1.0.',
                                },
                            },
                            required: [
                                'documentType',
                                'storeAbbreviation',
                                'suggestedName',
                                'suffix',
                                'originalNameRemoved',
                                'confidence',
                            ],
                        },
                    },
                });

                const resultText = response.text?.trim() || '{}';
                const result = JSON.parse(resultText) as DocumentAnalysisResult;
                
                // Cleanup / Sanitize
                const storeAbbr = (result.storeAbbreviation || 'Store').replace(/[^a-zA-Z0-9]/g, '');
                const invNum = result.invoiceNumber ? result.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '') : null;
                const lastName = result.customerLastName ? result.customerLastName.replace(/[^a-zA-Z0-9]/g, '') : null;
                
                let fallbackSuggestedName = result.suggestedName;

                // Ensure fallback formatting if model returned incomplete suggestedName
                if (!fallbackSuggestedName || fallbackSuggestedName.includes(' ') || fallbackSuggestedName.includes('.')) {
                    if (result.documentType === 'PRODUCT_INVOICE' && invNum) {
                        fallbackSuggestedName = `${storeAbbr}_${invNum}_N`;
                    } else if (result.documentType === 'TRANSACTION_RECEIPT' && invNum) {
                        fallbackSuggestedName = `${storeAbbr}_${invNum}_V`;
                    } else if (result.documentType === 'RETURN_NOTE' && invNum) {
                        fallbackSuggestedName = `${storeAbbr}_${invNum}_R`;
                    } else if (result.documentType === 'IDENTIFICATION' && lastName) {
                        fallbackSuggestedName = `${storeAbbr}_${lastName}_ID`;
                    } else if (result.documentType === 'CRUISE_CARD' && lastName) {
                        fallbackSuggestedName = `${storeAbbr}_${lastName}_CROWN`;
                    } else if (result.documentType === 'SHIPPING_INFO' && lastName) {
                        fallbackSuggestedName = `${storeAbbr}_${lastName}_SHIPPING`;
                    } else if (invNum) {
                        fallbackSuggestedName = `${storeAbbr}_${invNum}_DOC`;
                    } else {
                        fallbackSuggestedName = `${storeAbbr}_document`;
                    }
                }

                // Final clean up of suggestedName to prevent illegal filename characters
                const sanitizedSuggestedName = fallbackSuggestedName.replace(/[^a-zA-Z0-9_-]/g, '');

                const finalResult: DocumentAnalysisResult = {
                    documentType: result.documentType || 'OTHER',
                    storeAbbreviation: storeAbbr,
                    invoiceNumber: invNum,
                    customerLastName: lastName,
                    suggestedName: sanitizedSuggestedName,
                    suffix: result.suffix || 'OTHER',
                    originalNameRemoved: true,
                    confidence: typeof result.confidence === 'number' ? result.confidence : 0.95,
                };

                logger.info(`[GeminiService] Successfully analyzed document:`, finalResult);
                return finalResult;

            } catch (error: any) {
                lastError = error;
                logger.warn(`[GeminiService] Error analyzing image (Attempt ${i + 1})`, error);
                
                if (error.status >= 400 && error.status < 500 && error.status !== 429) {
                    break;
                }
                if (i < maxRetries - 1) {
                    await delay(Math.pow(2, i) * 1000);
                }
            }
        }
        
        logger.error("[GeminiService] Error analyzing image with Gemini Vertex AI after retries:", lastError);
        
        // Fallback default
        return {
            documentType: 'OTHER',
            storeAbbreviation: 'Store',
            invoiceNumber: null,
            customerLastName: null,
            suggestedName: 'Store_Document_Processed',
            suffix: 'OTHER',
            originalNameRemoved: true,
            confidence: 0.5,
        };
    }
}
