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
    ANALYZING = 'ANALYZING',
    RENAMING = 'RENAMING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export interface FileProcessState {
    item: ShareFileItem;
    status: 'pending' | 'analyzing' | 'renaming' | 'success' | 'error';
    suggestedCategory?: string;
    extractedInvoice?: string;
    extractedStoreName?: string;
    newName?: string;
    errorMessage?: string;
    previewUrl?: string;
}

export interface BreadcrumbItem {
    id: string;
    name: string;
}
