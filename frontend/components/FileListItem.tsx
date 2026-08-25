import React, { useState } from 'react';
import { FileImage, Folder, CheckCircle2, XCircle, Loader2, ArrowRight, Eye, Tag } from 'lucide-react';
import { FileProcessState, ShareFileItem } from '../types.ts';

interface FileListItemProps {
    fileState: FileProcessState;
    onFolderClick?: (item: ShareFileItem) => void;
}

export const FileListItem: React.FC<FileListItemProps> = ({ fileState, onFolderClick }) => {
    const { item, status, newName, errorMessage, docType, shortName, storeUsed, extractedInvoice, confidence, previewUrl } = fileState;
    const [isHovered, setIsHovered] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    };

    if (item.isFolder) {
        return (
            <div 
                className="flex items-center p-4 border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer group"
                onClick={() => onFolderClick && onFolderClick(item)}
            >
                <div className="flex-shrink-0 mr-4 w-5 h-5"></div>
                
                <div className="flex-shrink-0 mr-4 bg-blue-100 p-2 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Folder className="w-6 h-6 text-blue-600 fill-blue-100" />
                </div>

                <div className="flex-grow min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={item.Name}>
                        {item.Name}
                    </p>
                    <p className="text-xs text-gray-500">Folder</p>
                </div>

                <div className="flex-shrink-0 text-gray-300 group-hover:text-blue-500 transition-colors">
                    <ArrowRight className="w-5 h-5" />
                </div>
            </div>
        );
    }

    const getStatusIcon = () => {
        switch (status) {
            case 'pending':
                return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
            case 'analyzing':
            case 'renaming':
                return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
            case 'success':
                return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case 'error':
                return <XCircle className="w-5 h-5 text-red-500" />;
            default:
                return null;
        }
    };

    const getStatusBadge = () => {
        switch (status) {
            case 'analyzing':
                return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full animate-pulse">Analizando Lote...</span>;
            case 'renaming':
                return <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">Renombrando...</span>;
            case 'success':
                return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Renombrado</span>;
            case 'error':
                return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full" title={errorMessage}>Error</span>;
            default:
                return null;
        }
    };

    return (
        <div 
            className={`flex items-center p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors relative ${status === 'error' ? 'bg-red-50/30' : ''}`}
            onMouseMove={handleMouseMove}
        >
            <div className="flex-shrink-0 mr-4">
                {getStatusIcon()}
            </div>
            
            {/* Thumbnail Preview Icon */}
            <div 
                className="flex-shrink-0 mr-4 bg-gray-100 rounded-lg overflow-hidden w-12 h-12 flex items-center justify-center border border-gray-200 shadow-xs relative cursor-pointer group"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {previewUrl ? (
                    <>
                        <img 
                            src={previewUrl} 
                            alt={item.FileName} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="w-4 h-4 text-white" />
                        </div>
                    </>
                ) : (
                    <FileImage className="w-6 h-6 text-gray-500" />
                )}
            </div>

            {/* Hover Floating Full Image Viewer / Modal Tooltip */}
            {isHovered && previewUrl && (
                <div 
                    className="fixed z-50 bg-white p-2 rounded-xl shadow-2xl border border-gray-200 pointer-events-none transition-opacity duration-150 animate-fade-in"
                    style={{
                        top: Math.min(mousePos.y - 120, window.innerHeight - 340),
                        left: Math.min(mousePos.x + 20, window.innerWidth - 300),
                        width: '280px',
                        maxHeight: '360px'
                    }}
                >
                    <div className="overflow-hidden rounded-lg bg-gray-900 border border-gray-100 flex items-center justify-center min-h-[200px] max-h-[300px]">
                        <img 
                            src={previewUrl} 
                            alt="Full Preview" 
                            className="w-full h-full object-contain max-h-[280px]" 
                        />
                    </div>
                    <div className="mt-2 text-center">
                        <p className="text-xs font-semibold text-gray-700 truncate">{item.FileName || item.Name}</p>
                        <p className="text-[10px] text-gray-400">Hover Preview</p>
                    </div>
                </div>
            )}

            <div className="flex-grow min-w-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                {/* Original Name */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={item.FileName}>
                        {item.FileName}
                    </p>
                    <p className="text-xs text-gray-500">
                        {(item.FileSizeBytes ? (item.FileSizeBytes / 1024).toFixed(1) + ' KB' : 'Unknown size')}
                    </p>
                </div>

                {/* Arrow (only show if we have a new name or are processing) */}
                {(newName || status === 'analyzing' || status === 'renaming') && (
                    <div className="hidden md:flex flex-shrink-0 text-gray-400">
                        <ArrowRight className="w-4 h-4" />
                    </div>
                )}

                {/* New Name / Category */}
                <div className="flex-1 min-w-0">
                    {newName ? (
                        <div>
                            <div className="flex items-center gap-2">
                                {shortName && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-md tracking-wider flex items-center gap-1">
                                        <Tag className="w-2.5 h-2.5" /> {shortName}
                                    </span>
                                )}
                                <p className="text-sm font-bold text-blue-700 truncate font-mono" title={newName}>
                                    {newName}
                                </p>
                            </div>
                            {(docType || storeUsed || extractedInvoice) && (
                                <p className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                    {storeUsed && <span>Store: <span className="font-medium text-gray-700">{storeUsed}</span></span>}
                                    {extractedInvoice && <span>Invoice: <span className="font-medium text-gray-700">{extractedInvoice}</span></span>}
                                    {docType && <span>Type: <span className="font-medium text-gray-700">{docType}</span></span>}
                                    {confidence !== undefined && <span>Conf: <span className="font-medium text-green-600">{Math.round(confidence * 100)}%</span></span>}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="h-5"></div>
                    )}
                </div>
            </div>

            <div className="flex-shrink-0 ml-4 flex flex-col items-end gap-1">
                {getStatusBadge()}
                {errorMessage && (
                    <span className="text-xs text-red-600 max-w-[150px] truncate" title={errorMessage}>
                        {errorMessage}
                    </span>
                )}
            </div>
        </div>
    );
};
