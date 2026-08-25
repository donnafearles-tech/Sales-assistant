import { GoogleGenAI, Type } from '@google/genai';
import { ShareFileItem, BatchClassificationItem } from '../types.ts';
import { logger } from '../utils/logger.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GeminiService {
    private ai: GoogleGenAI;

    constructor() {
        // Initialize GoogleGenAI SDK with Vertex AI enabled as mandated by Vertex AI Studio guidelines
        const apiKey = process.env.API_KEY || '';
        this.ai = new GoogleGenAI({ apiKey, vertexai: true });
        logger.info("[GeminiService] Initialized GoogleGenAI client with Vertex AI.");
    }

    /**
     * Batch Classify Folder Content using full folder context and unyielding official ShareFile nomenclature formula:
     * [Abbreviation on SF]_[# invoice]_[Short name].[ext]
     */
    async classifyFolderBatch(
        folderName: string,
        filesData: Array<{ item: ShareFileItem; base64: string; mimeType: string }>,
        maxRetries = 3
    ): Promise<BatchClassificationItem[]> {
        logger.info(`[GeminiService] Initiating strict batch classification for folder: "${folderName}" with ${filesData.length} files.`);

        const prompt = `
# Rol y Misión

Eres un motor de clasificación y renombrado de documentos comerciales para carpetas de ShareFile.

# Regla de Contexto de Carpeta Completa

- Recibirás un lote de archivos pertenecientes a la misma carpeta contenedora: "${folderName}".
- Analiza todos los documentos del lote en conjunto.
- Si un documento (ej. VIP Card, Passport, Voucher o ID) no muestra explícitamente el nombre de la tienda o el número de factura (Invoice), utiliza la información extraída de los documentos principales del lote (ej. Ticket Nova) o el prefijo de la carpeta contenedora ("${folderName}") para completar los datos faltantes. El número de Invoice es el eje central para agrupar los archivos.

# Guía Especial de Reconocimiento Visual y OCR

1. 💳 **VOUCHER (Short name: V)**:
   - **Características clave**: Comprobante/ticket impreso de terminal bancaria (POS) o pago electrónico.
   - **Bancos y pasarelas de pago**: "BBVA", "BBVA BANCOMER", "CENTRALPAY", "KUSHKI", "SANTANDER", "BANAMEX", "HSBC", "GETNET".
   - **Palabras y marcas de reconocimiento**: "APROBACION", "APROBACIÓN", "APROBADA", "APPROVED", "AUTORIZACION", "AUTORIZACIÓN", "VENTA", "TARJETA", "AFILIACION", "AFILIACIÓN", "TRANSACCION", "TRANSACCIÓN", "ARQC", "AID", "LOTE", "OPER", "VISA", "MASTERCARD", "AMERICAN EXPRESS", "AMEX", "DISCOVER", "VISA INTERNACIONAL", dígitos de tarjeta ("TARJETA 1005", "TARJETA 3008", "****2254"), firma manuscrita o digital ("FIRMA:").
   - **Short Name**: V
   - **Formato**: [Abbreviation]_[# invoice]_V.[ext] (Ejemplos: ROYALT3_891591_V.jpg, EARTHCM_847634_V.jpg, MORENAMIA_186291_V.jpg)

2. 🧾 **TICKET NOVA (Short name: N)**:
   - **Características clave**: Factura o recibo de venta impreso detallando listado de productos, cantidades, precios, desglose de subtotal/IVA, RFC y número de Invoice.
   - **Short Name**: N
   - **Formato**: [Abbreviation]_[# invoice]_N.[ext] (Ejemplo: ROYALT3_166422_N.jpg)

3. 🆔 **IDENTIFICATION (Short name: ID) & ID_2**:
   - **ID (Frente)**: Licencia de conducir / Identificación oficial con fotografía de la persona.
   - **ID_2 / ID 2 (Reverso)**: Reverso de la licencia con código de barras PDF417, banda magnética y sin fotografía.

# Nomenclaturas de Documentos (Short Names)

Utiliza strictly los siguientes sufijos según el tipo de documento:

| Item | Short name |
| --- | --- |
| Identification | ID |
| Passport | PASS |
| Cruise Ship Card | CID |
| Ticket Nova | N |
| Voucher | V |
| Voucher Digital | VD |
| Vip Card/Info Card | VIP |
| Shipping Form | SHIPPING |
| Negative/Return | R |
| Product Correction | PC |
| Other adjustments (price, payment, etc) | ADJ |
| Gift Product | GIFT |
| Notes/Comments | TXT |
| Giveback Form | GBK |
| Credit Card | CC |

# Abreviaciones de Tiendas (Store Abbreviations on SF)

Utiliza EXCLUSIVAMENTE los códigos de la columna "Abbreviation on SF" para el renombrado. Elimina cualquier espacio en blanco en el código final.

| Región | Tienda / Documento | Abbreviation on SF |
| --- | --- | --- |
| Cancún | Natural Beauty Terminal 3 / Royal Bee T3 | ROYALT3 |
| Cancún | Beyond The Soap T4 | BETHST4 |
| Cancún | Vine Garden T4 | VINEGT4 |
| Cancún | Earth Terminal 4 | EARTHT4 |
| Cancún | Empire Tech Kiosk T3 | EMPTT3 |
| Cancún | Natural Beauty T4 | NTBT4 |
| Costa Maya | Earth Costa Maya | EARTHCM |
| Costa Maya | Earth Palapa | EARTHCM2 |
| Costa Maya | Empire Tech Costa Maya | EMPIRETECH |
| Costa Maya | Vine Garden Costa Maya | VINEGARDENCM |
| Cozumel | Hermetise SSA1 | HERMETISSSA1 |
| Cozumel | Earth SSA2 | EARTHSSA2 |
| Cozumel | Tresor Rare SSA3 | TRESORSSA3 |
| Cozumel | Empire SSA4 | EMPIRETECHSSA4 |
| Cozumel | Natural Beauty SSA5 | NATURALBSSA5 |
| Cozumel | Mareva Palapa SSA6 | MAREVASSA6 |
| Cozumel | CZM Airport / Earth CZM Airport | EARTHAIRPORT |
| Cozumel | Lavelier Punta Langosta | LAVELIERPL |
| Cozumel | Empire Tech Punta Langosta | EMPIREPL |
| Rep. Dom. | Earth DR | EARTHDR |
| Rep. Dom. | Riviera DR | RIVIERA |
| Rep. Dom. | Natural Beauty DR | NATURALBEAUTY |
| Rep. Dom. | Empire Tech DR | EMPIRETECH |
| Rep. Dom. | Empire Tech Spa DR | EMPIRESPA |
| Extra | Puerto Rico | PUERTORICO |
| Extra | Online Sales | ONLINE |
| Extra | Morena Mia | MORENAMIA |

# Estructura de Renombrado

FORMATO GENERAL (Fórmula estricta): [Abbreviation on SF]_[# invoice]_[Short name].[ext]

Ejemplos:
- TICKET_NOVA: ROYALT3_166422_N.jpg
- VOUCHER: ROYALT3_891591_V.jpg
- VOUCHER: EARTHCM_847634_V.jpg
- IDENTIFICATION: EARTHCM2_166422_ID.jpg
- PASSPORT: EARTHCM2_166422_PASS.jpg
- CRUISE_CARD: EARTHCM2_166422_CID.jpg
- VOUCHER_DIGITAL: ROYALT3_166422_VD.jpg
- VIP_CARD: EARTHCM2_166422_VIP.jpg
- SHIPPING_INFO: EARTHCM2_166422_SHIPPING.jpg
- NEGATIVE_RETURN: EARTHCM2_166422_R.jpg
- PRODUCT_CORRECTION: EARTHCM2_166422_PC.jpg
- OTHER_ADJUSTMENTS: EARTHCM2_166422_ADJ.jpg
- GIFT_PRODUCT: EARTHCM2_166422_GIFT.jpg
- NOTES_COMMENTS: EARTHCM2_166422_TXT.jpg
- GIVEBACK_FORM: EARTHCM2_166422_GBK.jpg
- CREDIT_CARD: EARTHCM2_166422_CC.jpg

# Reglas Críticas

1. FÓRMULA INQUEBRANTABLE: Todo archivo debe seguir el patrón Abbreviation_Invoice_ShortName. No uses nombres de clientes, ni apellidos.
2. ELIMINAR COMPLETAMENTE el nombre original del archivo.
3. El número de # invoice se comparte entre todos los documentos relacionados a la misma compra/transacción. Si el voucher tiene una "Aprobacion/Autorizacion" (ej. 891591) y hay una factura Nova en la misma carpeta con Invoice # 166510 asociada a esa transacción, se debe usar la invoice principal (166510) para unificar la carpeta.
4. El nombre de la tienda se obtiene de CUALQUIER archivo en la carpeta y se cruza con la tabla de abreviaciones oficiales.
5. Sin espacios, usar guiones bajos (_) entre partes, mantener mayúsculas en la abreviación de la tienda y el Short Name.
6. Si un documento secundario (ej. un Voucher, ID o pasaporte) no contiene el número de invoice impreso, infiérelo de la factura (Ticket Nova) que lo acompaña en el mismo lote.

Responde SIEMPRE con un arreglo JSON estricto matching the required schema.
`;

        // Construct multimodal parts: Prompt text + Each file image part labeled with fileId/originalName
        const parts: any[] = [{ text: prompt }];

        filesData.forEach((fileObj, idx) => {
            parts.push({
                text: `\n--- FILE #${idx + 1} | ID: "${fileObj.item.Id}" | Original Filename: "${fileObj.item.FileName || fileObj.item.Name}" ---`
            });
            parts.push({
                inlineData: {
                    data: fileObj.base64,
                    mimeType: fileObj.mimeType || 'image/jpeg'
                }
            });
        });

        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                logger.info(`[GeminiService] Executing multimodal batch query with official prompt (Attempt ${i + 1}/${maxRetries})...`);

                const response = await this.ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {
                        role: 'user',
                        parts: parts
                    },
                    config: {
                        temperature: 0.1, // Low temperature for strict adherence
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    fileId: {
                                        type: Type.STRING,
                                        description: 'The unique fileId corresponding to the input file.'
                                    },
                                    originalName: {
                                        type: Type.STRING,
                                        description: 'Original filename.'
                                    },
                                    docType: {
                                        type: Type.STRING,
                                        description: 'Official document classification type (e.g. TICKET_NOVA, VOUCHER, IDENTIFICATION, PASSPORT, etc).'
                                    },
                                    shortName: {
                                        type: Type.STRING,
                                        description: 'Exact short name code: ID, PASS, CID, N, V, VD, VIP, SHIPPING, R, PC, ADJ, GIFT, TXT, GBK, CC.'
                                    },
                                    suggestedName: {
                                        type: Type.STRING,
                                        description: 'Complete new filename INCLUDING extension following strict pattern Abbreviation_Invoice_ShortName.ext.'
                                    },
                                    storeUsed: {
                                        type: Type.STRING,
                                        description: 'Official store abbreviation used from table.'
                                    },
                                    invoiceUsed: {
                                        type: Type.STRING,
                                        description: 'The invoice number used or inferred for this file.'
                                    },
                                    confidence: {
                                        type: Type.NUMBER,
                                        description: 'Confidence score between 0.0 and 1.0.'
                                    }
                                },
                                required: ['fileId', 'originalName', 'docType', 'shortName', 'suggestedName', 'storeUsed', 'invoiceUsed', 'confidence']
                            }
                        }
                    }
                });

                const resultText = response.text?.trim() || '[]';
                const results = JSON.parse(resultText) as BatchClassificationItem[];

                logger.info(`[GeminiService] Successfully received ${results.length} batch classification items adhering to official prompt.`, results);
                return results;

            } catch (error: any) {
                lastError = error;
                logger.warn(`[GeminiService] Error in batch classification (Attempt ${i + 1}):`, error);

                if (error.status >= 400 && error.status < 500 && error.status !== 429) {
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
