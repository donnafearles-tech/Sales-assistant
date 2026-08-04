import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ConfigPanel } from './components/ConfigPanel.tsx';
import { FileListItem } from './components/FileListItem.tsx';
import { ToastContainer, ToastMessage } from './components/ToastContainer.tsx';
import { ShareFileService } from './services/shareFileService.ts';
import { GeminiService } from './services/geminiService.ts';
import { ProcessingStatus, FileProcessState, ShareFileItem, BreadcrumbItem } from './types.ts';
import { AlertCircle, Play, CheckCircle, FileImage, Info, ChevronRight, Home, Search } from 'lucide-react';
import { logger } from './utils/logger.ts';

const DEFAULT_ROOT_FOLDER = 'fo49cba4-7e9f-448d-9f24-58db5f71cf2c';

const App: React.FC = () => {
    // State
    const [token, setToken] = useState(() => {
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
    
    // Toast State
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // Refs for services
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

    // Core fetch logic for a specific path
    const loadDirectory = async (path: BreadcrumbItem[]) => {
        if (path.length === 0) return;
        
        setGlobalError(null);
        setIsDemoMode(false);
        setStatus(ProcessingStatus.FETCHING_FILES);
        setFiles([]);

        const currentFolder = path[path.length - 1];
        logger.info(`Loading directory: ${currentFolder.name} (${currentFolder.id})`);

        try {
            const baseUrl = localStorage.getItem('SHAREFILE_PROXY_URL') || 'https://seller-assitant-720693669884.europe-west1.run.app';
            const sfService = new ShareFileService(token, baseUrl);
            
            const { items, resolvedId } = await sfService.getFolderContents(currentFolder.id);
            
            setIsDemoMode(sfService.isMockMode);
            if (sfService.isMockMode) {
                addToast('info', 'Running in Sandbox Mode (Mock Data)');
            }

            // Recover the real folder name from the items' ParentName
            let realFolderName = currentFolder.name;
            if (items.length > 0 && items[0].ParentName) {
                realFolderName = items[0].ParentName;
            }

            // If the service fell back to a different root, update the breadcrumb to reflect reality
            if (resolvedId !== currentFolder.id) {
                path[path.length - 1].id = resolvedId;
                if (resolvedId === 'allfolders') path[path.length - 1].name = 'Shared Folders';
                else if (resolvedId === 'root') path[path.length - 1].name = 'Root';
                else if (resolvedId === 'home') path[path.length - 1].name = 'Home';
                else if (resolvedId === DEFAULT_ROOT_FOLDER) path[path.length - 1].name = 'Main Root';
                else path[path.length - 1].name = realFolderName;
                logger.info(`Fell back to directory: ${path[path.length - 1].name}`);
            } else {
                // Update with the real recovered name
                path[path.length - 1].name = realFolderName;
            }

            setSfPath([...path]);

            // Separate folders and image files
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
            
            addToast('success', `Loaded ${folders.length} folders and ${imageFiles.length} files.`);

            // Asynchronously fetch previews for thumbnails
            loadPreviewsForFiles(sfService, imageFiles);

        } catch (error: any) {
            const errorMsg = error.message || "Failed to fetch directory contents.";
            setGlobalError(errorMsg);
            setStatus(ProcessingStatus.ERROR);
            addToast('error', 'Failed to load directory. Check logs for details.');
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

            // Update breadcrumb to show search mode
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

            // Asynchronously fetch previews for thumbnails
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
        
        // Auto-detect and extract folder ID if user pasted a full ShareFile URL
        const urlMatch = targetId.match(/(?:folders\/|id=)?(fo[a-zA-Z0-9\-]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/i);
        
        if (urlMatch && urlMatch[1]) {
            targetId = urlMatch[1];
            if (targetId !== folderId) {
                setFolderId(targetId); // Clean up the input field to show just the ID
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
        // Slice the path to go back to the selected level
        const newPath = sfPath.slice(0, index + 1);
        
        // If the clicked breadcrumb is a search result, re-trigger search
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

    const processFiles = async () => {
        const filesToProcess = files.filter(f => !f.item.isFolder);
        if (filesToProcess.length === 0) return;
        
        setStatus(ProcessingStatus.ANALYZING);
        setGlobalError(null);
        logger.info(`Starting batch process for ${filesToProcess.length} files.`);
        addToast('info', `Starting auto-rename for ${filesToProcess.length} files...`);
        
        const baseUrl = localStorage.getItem('SHAREFILE_PROXY_URL') || 'https://seller-assitant-720693669884.europe-west1.run.app';
        const sfService = new ShareFileService(token, baseUrl);
        sfService.isMockMode = isDemoMode;

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < files.length; i++) {
            const currentFile = files[i];
            if (currentFile.item.isFolder || currentFile.status === 'success') continue;

            setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'analyzing' } : f));

            try {
                const originalName = currentFile.item.FileName || currentFile.item.Name || "Unknown";
                const originalNameUpper = originalName.toUpperCase();
                
                const lastDotIndex = originalName.lastIndexOf('.');
                const ext = lastDotIndex !== -1 ? originalName.substring(lastDotIndex + 1) : '';
                
                let newName = "";
                let category = "";
                let invoiceNumber = "";
                let storeName = "";

                // ---------------------------------------------------------
                // Process all files with Gemini
                // ---------------------------------------------------------
                const { base64, mimeType } = await sfService.downloadFileAsBase64(currentFile.item.Id);
                
                // Update preview URL if missing
                const previewUrl = `data:${mimeType};base64,${base64}`;
                
                // Gemini extracts details based on the custom sales prompt
                const analysis = await geminiServiceRef.current.analyzeImageContent(base64, mimeType);
                
                category = analysis.documentType;
                invoiceNumber = analysis.invoiceNumber || "N/A";
                storeName = analysis.storeAbbreviation;
                
                // Apply the exact suggested name from Gemini, keeping the original extension
                newName = `${analysis.suggestedName}${ext ? '.' + ext : ''}`;

                // Save previewUrl in state
                setFiles(prev => prev.map(f => f.item.Id === currentFile.item.Id ? { ...f, previewUrl } : f));

                setFiles(prev => prev.map((f, idx) => idx === i ? { 
                    ...f, 
                    status: 'renaming', 
                    suggestedCategory: category,
                    extractedInvoice: invoiceNumber,
                    extractedStoreName: storeName,
                    newName: newName
                } : f));

                await sfService.renameFile(currentFile.item.Id, newName);

                setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'success' } : f));
                successCount++;

            } catch (error: any) {
                logger.error(`Failed processing file ${currentFile.item.FileName || currentFile.item.Name}:`, error);
                setFiles(prev => prev.map((f, idx) => idx === i ? { 
                    ...f, 
                    status: 'error',
                    errorMessage: error.message || "Processing failed"
                } : f));
                errorCount++;
            }
        }

        setStatus(ProcessingStatus.COMPLETED);
        logger.info(`Batch process completed. Success: ${successCount}, Errors: ${errorCount}`);
        
        if (errorCount > 0) {
            addToast('error', `Completed with ${errorCount} errors. Check logs.`);
        } else {
            addToast('success', `Successfully renamed ${successCount} files!`);
        }
    };

    // Derived state
    const isProcessing = status === ProcessingStatus.FETCHING_FILES || status === ProcessingStatus.ANALYZING || status === ProcessingStatus.RENAMING;
    const processableFiles = files.filter(f => !f.item.isFolder);
    const canProcess = processableFiles.length > 0 && !isProcessing && status !== ProcessingStatus.COMPLETED;
    const completedCount = processableFiles.filter(f => f.status === 'success').length;
    const currentErrorCount = processableFiles.filter(f => f.status === 'error').length;

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-gray-50 relative">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            
            {/* Sidebar */}
            <ConfigPanel 
                token={token}
                setToken={setToken}
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
                        <h2 className="text-2xl font-bold text-gray-800">File Processing Queue</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {processableFiles.length > 0 
                                ? `${processableFiles.length} file(s) ready for analysis and renaming.` 
                                : 'Navigate folders, search, or load files to begin.'}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        {/* Global Search Bar */}
                        <form onSubmit={handleSearch} className="relative flex-1 md:w-64">
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

                        {processableFiles.length > 0 && (
                            <button
                                onClick={processFiles}
                                disabled={!canProcess}
                                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-md font-medium text-white shadow-sm transition-all whitespace-nowrap
                                    ${canProcess 
                                        ? 'bg-green-600 hover:bg-green-700 hover:shadow-md' 
                                        : 'bg-gray-300 cursor-not-allowed'}`}
                            >
                                {status === ProcessingStatus.COMPLETED ? (
                                    <><CheckCircle className="w-5 h-5" /> Completed</>
                                ) : (
                                    <><Play className="w-5 h-5" /> Start Auto-Rename</>
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

                {/* Stats Bar (visible when processing or done) */}
                {processableFiles.length > 0 && (
                    <div className="px-8 py-3 bg-gray-100 border-b border-gray-200 flex gap-6 text-sm flex-shrink-0">
                        <span className="font-medium text-gray-600">Files: {processableFiles.length}</span>
                        <span className="font-medium text-green-600">Success: {completedCount}</span>
                        {currentErrorCount > 0 && <span className="font-medium text-red-600">Errors: {currentErrorCount}</span>}
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
                                    : "Enter your ShareFile Folder ID or URL in the sidebar, then click 'Load Files' to fetch images."}
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
