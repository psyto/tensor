import type { Instance } from "../types/quicknode";
export declare function createInstance(data: {
    quicknode_id: string;
    endpoint_id: string;
    wss_url: string;
    http_url: string;
    chain: string;
    network: string;
    plan: string;
    referers?: string[];
    contract_addresses?: string[];
}): Instance;
export declare function getInstanceByEndpointId(endpointId: string): Instance | undefined;
export declare function getActiveInstanceByEndpointId(endpointId: string): Instance | undefined;
export declare function updateInstance(endpointId: string, data: {
    wss_url?: string;
    http_url?: string;
    chain?: string;
    network?: string;
    plan?: string;
    referers?: string[];
    contract_addresses?: string[];
}): Instance | undefined;
export declare function deactivateInstance(endpointId: string): void;
export declare function deprovisionByQuicknodeId(quicknodeId: string): void;
