import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ConfigPanel } from './components/ConfigPanel.tsx';
import { FileListItem } from './components/FileListItem.tsx';
import { ToastContainer, ToastMessage } from './components/ToastContainer.tsx';
import { ShareFileService, uploadFileToShareFile } from './services/shareFileService.ts';
import { GeminiService } from './services/geminiService.ts';
import { ProcessingStatus, FileProcessState, ShareFileItem, BreadcrumbItem } from './types.ts';
import { AlertCircle, Play, CheckCircle, FileImage, Info, ChevronRight, Home, Search, Layers, Sparkles, Upload, Loader2 } from 'lucide-react';
import { logger } from './utils/logger.ts';

const DEFAULT_ROOT_FOLDER = 'fo49cba4-7e9f-448d-9f24-58db5f71cf2c';

const App: React.FC = () => {
    // State
    const [token] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('SHAREFILE_ACCESS_TOKEN') || '';
        }
        return '';
    });
    const [folderId, setFolderId] = useState(DEFAULT_ROOT_FOLDER);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
    const [files, setFiles] = useState<FileProcessState[]>([]);
    const [sfPath, setSfPath] = useState<BreadcrumbItem[]>([]);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
    const [isUploading, setIsUploading] = useState<boolean>(false);
    
    // Toast State
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // File input ref for uploading
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Services
    const geminiServiceRef = useRef(new GeminiService());

    useEffect(() => {
        logger.info("Application started.");
    }, []);

    const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Helper to asynchronously load image preview thumbnails
    const loadPreviewsForFiles = async (sfService: ShareFileService, items: ShareFileItem[]) => {
        for (const item of items) {
            if (item.isFolder) continue;
            try {
                const { base64, mimeType } = await sfService.downloadFileAsBase64(item.Id);
                const previewUrl = `data:${mimeType};base64,${base64}`;
                setFiles(prev => prev.map(f => f.item.Id === item.Id ? { ...f, previewUrl } : f));
            } catch (err) {
                logger.warn(`Could not load preview thumbnail for ${item.FileName || item.Name}`);
            }
        }
    };

    // =========================================================================
    // FASE 1: Extraer (Leer carpeta de ShareFile)
    // =========================================================================
    const loadDirectory = async (path: BreadcrumbItem[]) => {
        if (path.length === 0) return;
        
        setGlobalError(null);
        setIsDemoMode(false);
        setStatus(ProcessingStatus.FETCHING_FILES);
        setFiles([]);

        const currentFolder = path[path.length - 1];
        logger.info(`[Fase 1: Extraer] Loading directory: ${currentFolder.name} (${currentFolder.id})`);

        try {
            const baseUrl = localStorage.getItem('SHAREFILE_PROXY_URL') || 'https://seller-assitant-720693669884.europe-west1.run.app';
            const sfService = new ShareFileService(token, baseUrl);
            
            const { items, resolvedId } = await sfService.getFolderFiles(currentFolder.id);
            
            setIsDemoMode(sfService.isMockMode);
            if (sfService.isMockMode) {
                addToast('info', 'Running in Sandbox Mode (Mock Data)');
            }

            // Recover the real folder name from the items' ParentName
            let realFolderName = currentFolder.name;
            if (items.length > 0 && items[0].ParentName) {
                realFolderName = items[0].ParentName;
            }

            // If the service fell back to a different root, update the breadcrumb
            if (resolvedId !== currentFolder.id) {
                path[path.length - 1].id = resolvedId;
                if (resolvedId === 'allfolders') path[path.length - 1].name = 'Shared Folders';
                else if (resolvedId === 'root') path[path.length - 1].name = 'Root';
                else if (resolvedId === 'home') path[path.length - 1].name = 'Home';
                else if (resolvedId === DEFAULT_ROOT_FOLDER) path[path.length - 1].name = 'Main Root';
                else path[path.length - 1].name = realFolderName;
            } else {
                path[path.length - 1].name = realFolderName;
            }

            setSfPath([...path]);

            // Separate folders and image/document files
            const folders = items.filter(i => i.isFolder);
            const imageFiles = items.filter(i => {
                if (i.isFolder) return false;
                const ext = (i.FileName || i.Name || '').split('.').pop()?.toLowerCase();
                return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext || '');
            });

            // Combine them: Folders first, then files
            const initialFileStates: FileProcessState[] = [...folders, ...imageFiles].map(item => ({
                item,
                status: 'pending'
            }));

            setFiles(initialFileStates);
            setStatus(ProcessingStatus.IDLE);
            
            addToast('success', `Fase 1 Completada: ${folders.length} carpetas y ${imageFiles.length} archivos cargados.`);

            // Asynchronously fetch previews for thumbnails
            loadPreviewsForFiles(sfService, imageFiles);

        } catch (error: any) {
            const errorMsg = error.message || "Failed to fetch directory contents.";
            setGlobalError(errorMsg);
            setStatus(ProcessingStatus.ERROR);
            addToast('error', 'Fase 1 Falló: No se pudo leer la carpeta. Revisa los logs.');
        }
    };

    // Global Search Handler
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setGlobalError(null);
        setIsDemoMode(false);
        setStatus(ProcessingStatus.FETCHING_FILES);
        setFiles([]);

        logger.info(`Global Search initiated for: ${searchQuery}`);

        try {
            const baseUrl = localStorage.getItem('SHAREFILE_PROXY_URL') || 'https://seller-assitant-720693669884.europe-west1.run.app';
            const sfService = new ShareFileService(token, baseUrl);
            
            const { items } = await sfService.searchFiles(searchQuery);
            
            setIsDemoMode(sfService.isMockMode);
            if (sfService.isMockMode) {
                addToast('info', 'Running in Sandbox Mode (Mock Data)');
            }

            setSfPath([{ id: `search:${searchQuery}`, name: `Search: "${searchQuery}"` }]);

            const folders = items.filter(i => i.isFolder);
            const imageFiles = items.filter(i => {
                if (i.isFolder) return false;
                const ext = (i.FileName || i.Name || '').split('.').pop()?.toLowerCase();
                return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext || '');
            });

            const initialFileStates: FileProcessState[] = [...folders, ...imageFiles].map(item => ({
                item,
                status: 'pending'
            }));

            setFiles(initialFileStates);
            setStatus(ProcessingStatus.IDLE);
            addToast('success', `Found ${items.length} items matching "${searchQuery}".`);

            loadPreviewsForFiles(sfService, imageFiles);

        } catch (error: any) {
            const errorMsg = error.message || "Failed to search files.";
            setGlobalError(errorMsg);
            setStatus(ProcessingStatus.ERROR);
            addToast('error', 'Search failed. Check logs.');
        }
    };

    // Handlers
    const handleFetchFiles = () => {
        let targetId = folderId.trim();
        
        const urlMatch = targetId.match(/(?:folders\/|id=)?(fo[a-zA-Z0-9\-]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/i);
        
        if (urlMatch && urlMatch[1]) {
            targetId = urlMatch[1];
            if (targetId !== folderId) {
                setFolderId(targetId);
            }
            logger.info(`Extracted Folder ID from input: ${targetId}`);
        }

        if (!targetId) {
            targetId = DEFAULT_ROOT_FOLDER;
        }

        const initialPath = [{ id: targetId, name: targetId === DEFAULT_ROOT_FOLDER ? 'Main Root' : 'Target Folder' }];
        loadDirectory(initialPath);
    };

    const handleFolderClick = (folder: ShareFileItem) => {
        if (isProcessing) return;
        const newPath = [...sfPath, { id: folder.Id, name: folder.Name }];
        loadDirectory(newPath);
    };

    const handleBreadcrumbClick = (index: number) => {
        if (isProcessing) return;
        const newPath = sfPath.slice(0, index + 1);
        
        if (newPath[newPath.length - 1].id.startsWith('search:')) {
            const query = newPath[newPath.length - 1].id.split(':')[1];
            setSearchQuery(query);
            if (index === 0) {
                handleFetchFiles();
            }
            return;
        }
        
        loadDirectory(newPath);
    };

    const handleExportLogs = () => {
        logger.exportLogs();
        addToast('success', 'Logs exported successfully.');
    };

    // =========================================================================
    // SUBIR ARCHIVOS A SHAREFILE
    // =========================================================================
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        const currentFolderId = sfPath[sfPath.length - 1]?.id || folderId || DEFAULT_ROOT_FOLDER;
        setIsUploading(true);
        addToast('info', `Subiendo ${selectedFiles.length} archivo(s) a ShareFile...`);

        let uploadedCount = 0;
        let failCount = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            try {
                logger.info(`Subiendo archivo: ${file.name} a la carpeta ${currentFolderId}`);
                await uploadFileToShareFile(currentFolderId, file);
                uploadedCount++;
            } catch (err: any) {
                logger.error(`Error al subir ${file.name}:`, err);
                failCount++;
            }
        }

        setIsUploading(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }

        if (uploadedCount > 0) {
            addToast('success', `¡Éxito! ${uploadedCount} archivo(s) subido(s) a ShareFile.`);
            if (sfPath.length > 0) {
                loadDirectory(sfPath);
            } else {
                handleFetchFiles();
            }
        }

        if (failCount > 0) {
            addToast('error', `Error al subir ${failCount} archivo(s). Revisa los logs.`);
        }
    };

    // =========================================================================
    // FASE 2 & FASE 3: Clasificar (Multimodal Batch) y Aplicar Renombrado
    // =========================================================================
    const processBatchFolder = async () => {
        const processableList = files.filter(f => !f.item.isFolder);
        if (processableList.length === 0) return;
        
        setGlobalError(null);
        const baseUrl = localStorage.getItem('SHAREFILE_PROXY_URL') || 'https://seller-assitant-720693669884.europe-west1.run.app';
        const sfService = new ShareFileService(token, baseUrl);
        sfService.isMockMode = isDemoMode;

        const currentFolderName = sfPath[sfPath.length - 1]?.name || "Folder";

        // ---------------------------------------------------------------------
        // FASE 2: Clasificar (Analizando contexto completo de la carpeta)
        // ---------------------------------------------------------------------
        setStatus(ProcessingStatus.ANALYZING_BATCH);
        addToast('info', `Fase 2: Analizando contexto de la carpeta "${currentFolderName}"...`);
        logger.info(`[Fase 2: Clasificar] Downloading ${processableList.length} files for batch multimodal query...`);

        // Update all files to analyzing status
        setFiles(prev => prev.map(f => !f.item.isFolder ? { ...f, status: 'analyzing' } : f));

        try {
            // Download binary base64 content for all files in the batch
            const filesWithData = await Promise.all(
                processableList.map(async (f) => {
                    const { base64, mimeType } = await sfService.downloadFileAsBase64(f.item.Id);
                    return {
                        item: f.item,
                        base64,
                        mimeType
                    };
                })
            );

            // Execute single multimodal call to Gemini with FULL FOLDER CONTEXT
            const batchResults = await geminiServiceRef.current.classifyFolderBatch(
                currentFolderName,
                filesWithData
            );

            logger.info(`[Fase 2: Clasificar] Received batch classification result for ${batchResults.length} items.`, batchResults);

            const filesWithNewName = batchResults.filter(b => b.suggestedName);
            logger.info(`[Fase 2: Clasificar] Archivos con nuevo nombre generados: ${filesWithNewName.length} de ${batchResults.length}`);

            if (filesWithNewName.length === 0) {
                throw new Error('Gemini no devolvió sugerencias de nombres válidos.');
            }

            // Map suggestions back into file states
            setFiles(prev => prev.map(f => {
                if (f.item.isFolder) return f;
                const match = batchResults.find(b => b.fileId === f.item.Id || b.originalName === (f.item.FileName || f.item.Name));
                if (match) {
                    return {
                        ...f,
                        docType: match.docType,
                        shortName: match.shortName,
                        suggestedName: match.suggestedName,
                        newName: match.suggestedName,
                        storeUsed: match.storeUsed,
                        extractedInvoice: match.invoiceUsed,
                        confidence: match.confidence,
                        status: 'pending' // Ready for Phase 3
                    };
                }
                return f;
            }));

            addToast('success', 'Fase 2 Completada: Contexto analizado. Aplicando renombrado en ShareFile...');

            // -----------------------------------------------------------------
            // FASE 3: Entregar y Aplicar (Ejecutar renameFile en ShareFile)
            // -----------------------------------------------------------------
            setStatus(ProcessingStatus.RENAMING);
            let successCount = 0;
            let errorCount = 0;

            // Iterate over batchResults directly
            for (const result of batchResults) {
                const fileId = result.fileId;
                const newName = result.suggestedName;

                if (!fileId || !newName) {
                    logger.warn(`[Fase 3: Aplicar] Saltando archivo sin ID o nombre:`, result);
                    continue;
                }

                setFiles(prev => prev.map(f =>
                    f.item.Id === fileId ? { ...f, status: 'renaming' } : f
                ));

                try {
                    logger.info(`[Fase 3: Aplicar] Renaming file ${fileId} -> ${newName}`);
                    console.log(`🔍 Renombrando: ${fileId} -> ${newName}`);
                    await sfService.renameFile(fileId, newName);

                    setFiles(prev => prev.map(f =>
                        f.item.Id === fileId ? { ...f, status: 'success', newName } : f
                    ));
                    successCount++;
                    logger.info(`✅ Archivo renombrado: ${newName}`);

                } catch (renameErr: any) {
                    logger.error(`[Fase 3: Aplicar] Error renaming file ${fileId}:`, renameErr);
                    setFiles(prev => prev.map(f =>
                        f.item.Id === fileId ? {
                            ...f,
                            status: 'error',
                            errorMessage: renameErr.message || 'Rename failed'
                        } : f
                    ));
                    errorCount++;
                }
            }

            setStatus(ProcessingStatus.COMPLETED);
            logger.info(`[Fase 3: Aplicar] Completed batch renaming. Success: ${successCount}, Errors: ${errorCount}`);

            if (errorCount > 0) {
                addToast('error', `Completado con ${errorCount} errores. Revisa los logs.`);
            } else {
                addToast('success', `¡Éxito! Se renombraron ${successCount} archivos en ShareFile.`);
            }

        } catch (batchErr: any) {
            logger.error(`[Fase 2: Clasificar] Error in batch folder processing:`, batchErr);
            setGlobalError(batchErr.message || "Error al clasificar el lote de la carpeta.");
            setStatus(ProcessingStatus.ERROR);
            setFiles(prev => prev.map(f => !f.item.isFolder && f.status === 'analyzing' ? { ...f, status: 'error', errorMessage: 'Batch analysis failed' } : f));
            addToast('error', 'Error en el análisis por lote de la carpeta.');
        }
    };

    // Derived state
    const isProcessing = status === ProcessingStatus.FETCHING_FILES || status === ProcessingStatus.ANALYZING_BATCH || status === ProcessingStatus.RENAMING;
    const processableFiles = files.filter(f => !f.item.isFolder);
    const canProcess = processableFiles.length > 0 && !isProcessing && status !== ProcessingStatus.COMPLETED;
    const completedCount = processableFiles.filter(f => f.status === 'success').length;
    const currentErrorCount = processableFiles.filter(f => f.status === 'error').length;

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-gray-50 relative">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            
            {/* Hidden File Input for ShareFile Upload */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                multiple 
                className="hidden" 
                accept="image/*,.pdf"
            />

            {/* Sidebar */}
            <ConfigPanel 
                folderId={folderId}
                setFolderId={setFolderId}
                onFetchFiles={handleFetchFiles}
                onExportLogs={handleExportLogs}
                isProcessing={isProcessing}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header Area */}
                <div className="bg-white border-b border-gray-200 px-8 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm z-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold text-gray-800">Procesador de Carpeta Multimodal</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> Formula: Store_Invoice_ShortName
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            {processableFiles.length > 0 
                                ? `${processableFiles.length} archivo(s) listos para clasificación oficial de ShareFile.` 
                                : 'Selecciona una carpeta, sube archivos o busca para comenzar.'}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {/* Global Search Bar */}
                        <form onSubmit={handleSearch} className="relative flex-1 md:w-56">
                            <input 
                                type="text" 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Global Search..."
                                disabled={isProcessing}
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        </form>

                        {/* Upload Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessing || isUploading}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-xs transition-all whitespace-nowrap text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Subir nuevos archivos a la carpeta actual"
                        >
                            {isUploading ? (
                                <><Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Subiendo...</>
                            ) : (
                                <><Upload className="w-4 h-4 text-blue-600" /> Subir Archivos</>
                            )}
                        </button>

                        {processableFiles.length > 0 && (
                            <button
                                onClick={processBatchFolder}
                                disabled={!canProcess}
                                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-md font-medium text-white shadow-sm transition-all whitespace-nowrap text-sm
                                    ${canProcess 
                                        ? 'bg-green-600 hover:bg-green-700 hover:shadow-md' 
                                        : 'bg-gray-300 cursor-not-allowed'}`}
                            >
                                {status === ProcessingStatus.COMPLETED ? (
                                    <><CheckCircle className="w-5 h-5" /> Renombrado Listo</>
                                ) : status === ProcessingStatus.ANALYZING_BATCH ? (
                                    <><Layers className="w-5 h-5 animate-pulse" /> Analizando Contexto...</>
                                ) : (
                                    <><Play className="w-5 h-5" /> Analizar y Renombrar Lote</>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Breadcrumb Navigation */}
                {sfPath.length > 0 && (
                    <div className="px-8 py-3 bg-white border-b border-gray-200 flex items-center gap-2 text-sm overflow-x-auto shadow-sm z-0">
                        <Home className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        {sfPath.map((crumb, index) => (
                            <React.Fragment key={crumb.id + index}>
                                {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                <button 
                                    onClick={() => handleBreadcrumbClick(index)}
                                    disabled={isProcessing}
                                    className={`whitespace-nowrap transition-colors focus:outline-none
                                        ${isProcessing ? 'cursor-not-allowed opacity-50' : 'hover:text-blue-600'} 
                                        ${index === sfPath.length - 1 ? 'font-bold text-gray-800' : 'text-gray-600'}`}
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* Global Error Banner */}
                {globalError && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 m-6 rounded-r-md shadow-sm flex-shrink-0">
                        <div className="flex items-center">
                            <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0" />
                            <div>
                                <p className="font-bold text-sm text-red-700">Error</p>
                                <p className="text-sm text-red-700">{globalError}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Demo Mode Banner */}
                {isDemoMode && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 m-6 rounded-r-md shadow-sm flex-shrink-0">
                        <div className="flex items-start">
                            <Info className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-bold text-yellow-800">Sandbox Mode Active</h3>
                                <p className="text-sm text-yellow-700 mt-1">
                                    No valid credentials found or authentication failed. The application is running in a local memory cache mode with mock data for demonstration purposes.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status Indicator */}
                {status === ProcessingStatus.ANALYZING_BATCH && (
                    <div className="bg-blue-50 border-b border-blue-200 px-8 py-3 flex items-center justify-between text-blue-800 text-sm">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 animate-spin text-blue-600" />
                            <span className="font-semibold">Fase 2: Analizando contexto completo de la carpeta con Gemini AI...</span>
                        </div>
                        <span className="text-xs text-blue-600 font-mono">Aplicando fórmula estricta: Store_Invoice_ShortName.ext</span>
                    </div>
                )}

                {/* Stats Bar (visible when processing or done) */}
                {processableFiles.length > 0 && (
                    <div className="px-8 py-3 bg-gray-100 border-b border-gray-200 flex gap-6 text-sm flex-shrink-0">
                        <span className="font-medium text-gray-600">Archivos en Lote: {processableFiles.length}</span>
                        <span className="font-medium text-green-600">Procesados: {completedCount}</span>
                        {currentErrorCount > 0 && <span className="font-medium text-red-600">Errores: {currentErrorCount}</span>}
                    </div>
                )}

                {/* File List Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {files.length === 0 && !isProcessing && !globalError ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <div className="bg-gray-100 p-6 rounded-full mb-4">
                                <FileImage className="w-12 h-12 text-gray-300" />
                            </div>
                            <p className="text-lg font-medium text-gray-500">No items found</p>
                            <p className="text-sm mt-2 max-w-md text-center">
                                {sfPath.length > 0 
                                    ? "This folder is empty or contains no supported image files."
                                    : "Enter your ShareFile Folder ID or URL in the sidebar, then click 'Load Files' or 'Subir Archivos' to upload images."}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                            {files.map((fileState) => (
                                <FileListItem 
                                    key={fileState.item.Id} 
                                    fileState={fileState} 
                                    onFolderClick={handleFolderClick}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
