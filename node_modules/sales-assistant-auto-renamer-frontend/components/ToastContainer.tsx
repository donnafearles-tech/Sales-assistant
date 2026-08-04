import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface ToastContainerProps {
    toasts: ToastMessage[];
    removeToast: (id: number) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => {
                const isError = toast.type === 'error';
                const isSuccess = toast.type === 'success';
                
                return (
                    <div 
                        key={toast.id} 
                        className={`flex items-start p-4 rounded-md shadow-lg border pointer-events-auto transition-all transform translate-y-0 opacity-100 w-80
                            ${isError ? 'bg-red-50 border-red-200' : isSuccess ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}
                        `}
                    >
                        <div className="flex-shrink-0 mr-3 mt-0.5">
                            {isError && <AlertCircle className="w-5 h-5 text-red-500" />}
                            {isSuccess && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {!isError && !isSuccess && <Info className="w-5 h-5 text-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isError ? 'text-red-800' : isSuccess ? 'text-green-800' : 'text-blue-800'}`}>
                                {toast.message}
                            </p>
                        </div>
                        <button 
                            onClick={() => removeToast(toast.id)}
                            className="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};
