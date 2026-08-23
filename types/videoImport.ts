export interface ModalPlace {
    name: string;
    maps_search_hint: string;
    description?: string;
    country?: string;
}

export interface ModalImportResult {
    title?: string;
    description?: string;
    platform?: string;
    places: ModalPlace[];
    agent_summary?: string;
    agent_error?: string;
    error?: string;
}
