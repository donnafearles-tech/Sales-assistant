export interface ShareFileItem {
    Id: string;
    Name: string;
    FileName: string;
    isFolder: boolean;
    FileSizeBytes?: number;
    CreationDate?: string;
    ParentName?: string;
    previewUrl?: string;
}

export enum ProcessingStatus {
    IDLE = 'IDLE',
    FETCHING_FILES = 'FETCHING_FILES',
    ANALYZING_BATCH = 'ANALYZING_BATCH',
    RENAMING = 'RENAMING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export type ShareFileShortName = 
    | 'ID' 
    | 'PASS' 
    | 'CID' 
    | 'N' 
    | 'V' 
    | 'VD' 
    | 'VIP' 
    | 'SHIPPING' 
    | 'R' 
    | 'PC' 
    | 'ADJ' 
    | 'GIFT' 
    | 'TXT' 
    | 'GBK' 
    | 'CC';

export interface BatchClassificationItem {
    fileId: string;
    originalName: string;
    docType: string;
    shortName: ShareFileShortName;
    suggestedName: string;
    storeUsed: string;
    invoiceUsed: string;
    confidence: number;
}

export interface FileProcessState {
    item: ShareFileItem;
    status: 'pending' | 'analyzing' | 'renaming' | 'success' | 'error';
    docType?: string;
    shortName?: ShareFileShortName;
    suggestedName?: string;
    storeUsed?: string;
    extractedInvoice?: string;
    confidence?: number;
    errorMessage?: string;
    previewUrl?: string;
}

export interface BreadcrumbItem {
    id: string;
    name: string;
}
