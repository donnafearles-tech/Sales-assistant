import React from 'react';
import { Key, FolderOpen, Settings, Download, Save } from 'lucide-react';

interface ConfigPanelProps {
    token: string;
    setToken: (val: string) => void;
    folderId: string;
    setFolderId: (val: string) => void;
    onFetchFiles: () => void;
    onExportLogs: () => void;
    isProcessing: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
    token,
    setToken,
    folderId,
    setFolderId,
    onFetchFiles,
    onExportLogs,
    isProcessing
}) => {

    const handleSaveConfig = () => {
        // El proxy ya tiene el token, pero la app necesita saber que debe usarlo
        const proxyUrl = 'https://seller-assitant-720693669884.europe-west1.run.app';
        
        // Guarda la URL del proxy
        localStorage.setItem('SHAREFILE_PROXY_URL', proxyUrl);
        localStorage.setItem('SHAREFILE_ACCESS_TOKEN', 'proxy-uses-token-in-backend');
        
        // Activa el modo proxy (no sandbox)
        localStorage.setItem('USE_PROXY', 'true');
        
        // Actualiza el estado local para que la UI refleje el cambio
        setToken('proxy-uses-token-in-backend');
        
        console.log('✅ Configuración guardada. Usando proxy en:', proxyUrl);
    };

    return (
        <div className="w-full md:w-80 bg-white border-r border-gray-200 p-6 flex flex-col h-full shadow-sm z-10">
            <div className="flex items-center gap-3 mb-8">
                <div className="bg-blue-600 p-2 rounded-lg">
                    <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Sales Assistant</h1>
                    <p className="text-xs text-gray-500">Auto File Renamer</p>
                </div>
            </div>

            <div className="space-y-6 flex-grow">
                {/* Token Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <Key className="w-4 h-4 text-gray-400" />
                        ShareFile Token
                    </label>
                    <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Bearer token..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        disabled={isProcessing}
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional. Handled by proxy server.</p>
                </div>

                {/* Folder ID Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-gray-400" />
                        Folder ID or URL
                    </label>
                    <input
                        type="text"
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                        placeholder="Paste URL or fo49cba4-..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        disabled={isProcessing}
                    />
                    <p className="text-xs text-gray-500 mt-1">Paste the full ShareFile URL or just the ID.</p>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 space-y-3">
                <button
                    onClick={onFetchFiles}
                    disabled={isProcessing}
                    className={`w-full py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                        ${isProcessing 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors'
                        }`}
                >
                    {isProcessing ? 'Processing...' : 'Load Files'}
                </button>
                
                <button
                    onClick={handleSaveConfig}
                    className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors flex items-center justify-center gap-2"
                >
                    <Save className="w-4 h-4" />
                    Save Config
                </button>

                <button
                    onClick={onExportLogs}
                    className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors flex items-center justify-center gap-2"
                >
                    <Download className="w-4 h-4" />
                    Export Logs
                </button>
            </div>
        </div>
    );
};
