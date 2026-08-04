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
     * Analyzes an image and returns file classification and renaming suggestions based on sales team rules.
     */
    async analyzeImageContent(base64Data: string, mimeType: string, maxRetries = 3): Promise<{
        documentType: string;
        storeAbbreviation: string;
        invoiceNumber: string | null;
        customerLastName: string | null;
        suggestedName: string;
        suffix: string;
        originalNameRemoved: boolean;
        confidence: number;
    }> {
        const prompt = `
You are a Document Organization Assistant for a sales team. Your job is to analyze, classify, and rename files.

## STORE NAME ABBREVIATIONS
- Royal Bee Terminal 3 Cancun → **RoyalBeeT3**
- Earth Palapa → **EarthPalapa**
- Morena Mia Beauty Group → **MorenaMia**
- Any other store: abbreviate to recognizable short name (max 15 chars)

## DOCUMENT TYPES & NAMING FORMATS

| Type | Format | Example |
|------|--------|---------|
| **PRODUCT_INVOICE** | \`[StoreAbbr]_[Invoice#]_N\` | \`RoyalBeeT3_166422_N.jpg\` |
| **TRANSACTION_RECEIPT** | \`[StoreAbbr]_[Invoice#]_V\` | \`RoyalBeeT3_166422_V.jpg\` |
| **RETURN_NOTE** | \`[StoreAbbr]_[Invoice#]_R\` | \`EarthPalapa_193671_R.jpg\` |
| **IDENTIFICATION** | \`[StoreAbbr]_[LastName]_ID\` | \`EarthPalapa_Bryant_ID.jpg\` |
| **CRUISE_CARD** | \`[StoreAbbr]_[LastName]_CROWN\` | \`EarthPalapa_Bryant_CROWN.jpg\` |
| **SHIPPING_INFO** | \`[StoreAbbr]_[LastName]_SHIPPING\` | \`EarthPalapa_Bryant_SHIPPING.jpg\` |
| **OTHER** | \`[StoreAbbr]_[description]\` | \`EarthPalapa_contract.jpg\` |

## CRITICAL RULES
1. **FIRST**: Store abbreviation ALWAYS goes first
2. **COMPLETELY REMOVE** the old filename - DO NOT keep any part of it
3. For **PRODUCT_INVOICE**: store abbreviation + invoice number + _N
4. For **TRANSACTION_RECEIPT**: store abbreviation + invoice number + _V
5. Find store name from ANY file in the folder (invoice, voucher, shipping, etc.)
6. Format: No spaces, use underscores (_) between parts, proper capitalization

## OUTPUT FORMAT (JSON only)
{
 "documentType": "PRODUCT_INVOICE|TRANSACTION_RECEIPT|IDENTIFICATION|CRUISE_CARD|SHIPPING_INFO|RETURN_NOTE|OTHER",
 "storeAbbreviation": "abbreviated_name",
 "invoiceNumber": "number or null",
 "customerLastName": "last name or null",
 "suggestedName": "new_filename_without_extension",
 "suffix": "N|V|R|ID|CROWN|SHIPPING|OTHER",
 "originalNameRemoved": true,
 "confidence": 0.0-1.0
}

## EXAMPLES
- Invoice → \`RoyalBeeT3_166422_N\`
- Bank Voucher → \`RoyalBeeT3_166422_V\`
- Return → \`EarthPalapa_193671_R\`
- ID → \`EarthPalapa_Bryant_ID\`
- Cruise Card → \`EarthPalapa_Bryant_CROWN\`
- Shipping → \`EarthPalapa_Bryant_SHIPPING\`

Remember: Store abbreviation ALWAYS comes first in the filename!
        `;

        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                logger.info(\`[GeminiService] Analyzing image content (Attempt \${i + 1}/\${maxRetries})\`, { mimeType });
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
                                documentType: { type: Type.STRING },
                                storeAbbreviation: { type: Type.STRING },
                                invoiceNumber: { type: Type.STRING, nullable: true },
                                customerLastName: { type: Type.STRING, nullable: true },
                                suggestedName: { type: Type.STRING },
                                suffix: { type: Type.STRING, nullable: true },
                                originalNameRemoved: { type: Type.BOOLEAN },
                                confidence: { type: Type.NUMBER }
                            },
                            required: ['documentType', 'storeAbbreviation', 'suggestedName', 'originalNameRemoved', 'confidence']
                        }
                    }
                });

                const resultText = response.text?.trim() || '{}';
                const result = JSON.parse(resultText);
                
                logger.info(\`[GeminiService] Successfully analyzed image: \${result.suggestedName} (\${result.documentType})\`);
                
                return {
                    documentType: result.documentType || 'OTHER',
                    storeAbbreviation: result.storeAbbreviation || 'STORE',
                    invoiceNumber: result.invoiceNumber || null,
                    customerLastName: result.customerLastName || null,
                    suggestedName: result.suggestedName || 'UNKNOWN_FILE',
                    suffix: result.suffix || '',
                    originalNameRemoved: !!result.originalNameRemoved,
                    confidence: result.confidence || 0
                };
            } catch (error: any) {
                lastError = error;
                logger.warn(\`[GeminiService] Error analyzing image (Attempt \${i + 1})\`, error);
                
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
        return {
            documentType: 'ERROR',
            storeAbbreviation: 'ERROR',
            invoiceNumber: null,
            customerLastName: null,
            suggestedName: 'ERROR_PROCESSING_FILE',
            suffix: '',
            originalNameRemoved: false,
            confidence: 0
        }; // Fallback
    }
}
