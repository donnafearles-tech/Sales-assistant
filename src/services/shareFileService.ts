import { ShareFileItem } from '../types.ts';
import { logger } from '../utils/logger.ts';

const SHAREFILE_PROXY_URL = 'https://seller-assitant-720693669884.europe-west1.run.app';
const DEFAULT_ROOT_FOLDER = 'fo49cba4-7e9f-448d-9f24-58db5f71cf2c';

/**
 * Uploads a local browser File object directly to ShareFile via backend proxy.
 */
export async function uploadFileToShareFile(folderId: string, file: File): Promise<any> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async () => {
            try {
                const rawResult = reader.result;
                let base64Content = '';
                if (typeof rawResult === 'string') {
                    base64Content = rawResult.includes(',') ? rawResult.split(',')[1] : rawResult;
                } else if (Array.isArray(rawResult)) {
                    base64Content = rawResult.length > 1 ? rawResult[1] : rawResult[0];
                }

                const response = await fetch(`${SHAREFILE_PROXY_URL}/api/sharefile/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderId,
                        fileName: file.name,
                        fileBase64: base64Content
                    })
                });

                const data = await response.json();
                if (data.success) {
                    resolve(data.result);
                } else {
                    reject(new Error(data.error || 'Error al subir archivo'));
                }
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

export class ShareFileService {
    public isMockMode: boolean = false;

    constructor(tokenCand?: string, urlCand?: string) {
        logger.info(`[ShareFileService] Initialized to use Proxy: ${SHAREFILE_PROXY_URL}`);
    }

    /**
     * Fase 1: getFolderFiles(folderId)
     * Descarga/obtiene la lista de archivos de una carpeta de ShareFile usando la API del proxy.
     */
    async getFolderFiles(folderId: string): Promise<{ items: ShareFileItem[], resolvedId: string }> {
        let targetId = folderId.trim();
        
        if (!targetId) {
            targetId = DEFAULT_ROOT_FOLDER;
        }

        logger.info(`[ShareFileService] 📂 (Fase 1) Obteniendo lista de archivos de carpeta: ${targetId}`);

        try {
            const url = new URL(`${SHAREFILE_PROXY_URL}/api/sharefile/items`);
            url.searchParams.append('id', targetId);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            logger.info(`[ShareFileService] 📡 Respuesta del proxy: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || 'Sin detalles'}`);
            }

            const data = await response.json();
            logger.info('[ShareFileService] ✅ Datos recibidos:', { 
                success: data.success, 
                actualFolderId: data.actualFolderId,
                isDemo: data.isDemo,
                itemCount: data.items?.length || 0
            });

            if (!data.success) {
                throw new Error(data.error || 'Error en proxy');
            }

            this.isMockMode = data.isDemo === true;
            const resolvedId = data.actualFolderId || targetId;
            const rawItems = data.items || [];
            
            const items: ShareFileItem[] = rawItems.map((item: any) => ({
                Id: item.Id || item.id,
                Name: item.Name || item.name,
                FileName: item.FileName || item.Name || item.name,
                isFolder: item['odata.type']?.includes('Folder') || item.type === 'Folder' || item.isFolder === true || item.FileCount !== undefined,
                FileSizeBytes: item.FileSizeBytes || item.size || 0,
                ParentName: item.ParentName || item.parentName || item.Parent?.Name || item.parent?.name || ''
            }));

            return { items, resolvedId };
            
        } catch (error) {
            logger.error('[ShareFileService] ❌ Error en getFolderFiles:', error);
            logger.warn('[ShareFileService] ⚠️ Activando demo_fallback local.');
            
            this.isMockMode = true;
            return { items: this.getMockData(), resolvedId: 'demo_fallback' };
        }
    }

    /**
     * Alias for getFolderFiles to maintain backward compatibility
     */
    async getFolderContents(folderId: string) {
        return this.getFolderFiles(folderId);
    }

    /**
     * Modo Búsqueda Global (/api/sharefile/items?search=...)
     */
    async searchFiles(query: string): Promise<{ items: ShareFileItem[], resolvedId: string }> {
        logger.info(`[ShareFileService] 🔍 Búsqueda Global: ${query}`);
        
        try {
            const url = new URL(`${SHAREFILE_PROXY_URL}/api/sharefile/items`);
            url.searchParams.append('search', query);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Error en proxy durante la búsqueda');
            }

            this.isMockMode = data.isDemo === true;
            const rawItems = data.items || [];
            
            const items: ShareFileItem[] = rawItems.map((item: any) => ({
                Id: item.Id || item.id,
                Name: item.Name || item.name,
                FileName: item.FileName || item.Name || item.name,
                isFolder: item['odata.type']?.includes('Folder') || item.type === 'Folder' || item.isFolder === true || item.FileCount !== undefined,
                FileSizeBytes: item.FileSizeBytes || item.size || 0,
                ParentName: item.ParentName || item.parentName || item.Parent?.Name || item.parent?.name || ''
            }));

            return { items, resolvedId: `search:${query}` };
        } catch (error) {
            logger.error('[ShareFileService] ❌ Error en Búsqueda Global:', error);
            logger.warn('[ShareFileService] ⚠️ Usando datos mock para búsqueda');
            this.isMockMode = true;
            
            const mockResults = this.getMockData().filter(f => 
                f.Name.toLowerCase().includes(query.toLowerCase())
            );
            
            return { items: mockResults, resolvedId: `search:${query}` };
        }
    }

    /**
     * Descarga un archivo binario a través del proxy y lo retorna como base64
     */
    async downloadFileAsBase64(fileId: string): Promise<{ base64: string, mimeType: string }> {
        logger.info(`[ShareFileService] 📥 Solicitando URL de descarga para el archivo: ${fileId}`);
        
        try {
            const urlRes = await fetch(`${SHAREFILE_PROXY_URL}/api/sharefile/download-url?itemId=${fileId}`);
            
            if (!urlRes.ok) {
                throw new Error(`HTTP ${urlRes.status}`);
            }

            const urlData = await urlRes.json();
            
            if (!urlData.success || !urlData.downloadUrl) {
                throw new Error(urlData.error || 'El proxy no devolvió una URL de descarga válida');
            }

            const fileRes = await fetch(urlData.downloadUrl);
            if (!fileRes.ok) {
                throw new Error(`Error al descargar el archivo binario: HTTP ${fileRes.status}`);
            }

            const blob = await fileRes.blob();
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    const base64 = base64data.split(',')[1];
                    resolve({ base64, mimeType: blob.type || 'image/jpeg' });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

        } catch (error) {
            logger.warn('[ShareFileService] ⚠️ Falló descarga real, usando imagen demo', error);
            const res = await fetch('https://picsum.photos/400/400');
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    const base64 = base64data.split(',')[1];
                    resolve({ base64, mimeType: blob.type || 'image/jpeg' });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
    }

    /**
     * Fase 3: renameFile(fileId, newName)
     * Ejecuta el renombrado mediante la API de ShareFile
     */
    async renameFile(fileId: string, newName: string): Promise<void> {
        logger.info(`[ShareFileService] ✏️ (Fase 3) Renombrando archivo mediante API ShareFile: ${fileId} -> ${newName}`);
        
        try {
            const response = await fetch(`${SHAREFILE_PROXY_URL}/api/sharefile/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: fileId, newName })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || data.warning || 'Error en proxy al renombrar');
            }
            
            logger.info(`[ShareFileService] ✅ Renombrado exitoso para ${fileId}`);
        } catch (error) {
            logger.error('[ShareFileService] ❌ Error en renameFile:', error);
            throw error;
        }
    }

    /**
     * Subir archivo a una carpeta de ShareFile vía ChunkUri
     */
    async uploadFile(folderId: string, fileName: string, fileBase64: string): Promise<any> {
        logger.info(`[ShareFileService] ⬆️ Subiendo archivo a ShareFile: ${fileName} en carpeta ${folderId}`);
        
        try {
            const response = await fetch(`${SHAREFILE_PROXY_URL}/api/sharefile/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId, fileName, fileBase64 })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Error en proxy al subir archivo');
            }
            
            logger.info(`[ShareFileService] ✅ Subida exitosa de ${fileName}`);
            return data.result;
        } catch (error) {
            logger.error('[ShareFileService] ❌ Error en uploadFile:', error);
            throw error;
        }
    }

    /**
     * Datos de demostración (sandbox / demo_fallback)
     */
    private getMockData(): ShareFileItem[] {
        const mockFiles = [
            { Id: 'mock1', Name: 'factura_001.pdf', Type: 'File' },
            { Id: 'mock2', Name: 'pedido_023.docx', Type: 'File' },
            { Id: 'mock3', Name: 'imagen_producto.jpg', Type: 'File' },
            { Id: 'mock4', Name: 'carpeta_ventas', Type: 'Folder' },
            { Id: 'mock5', Name: 'recibo_pago_agosto.png', Type: 'File' },
            { Id: 'mock6', Name: 'VIP_client_doc.jpg', Type: 'File', ParentName: 'RoyalBeeT3' },
        ];

        return mockFiles.map(file => ({
            Id: file.Id,
            Name: file.Name,
            FileName: file.Name,
            isFolder: file.Type === 'Folder',
            FileSizeBytes: file.Type === 'Folder' ? 0 : Math.floor(Math.random() * 500000) + 100000,
            ParentName: file.ParentName || ''
        }));
    }
}
