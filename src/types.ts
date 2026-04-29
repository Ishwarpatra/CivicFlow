import { CivicRepresentative } from './civicApiService.js';

export interface User {
    id: number;
    email: string;
    password_hash: string;
    role: 'voter' | 'admin';
    epic_number?: string;
    state?: string;
    constituency?: string;
    language_preference?: string;
    prompt_credits: number;
}

export interface ChatHistoryItem {
    role: 'user' | 'model';
    text: string;
}

export interface Constituency {
    id: number;
    name: string;
    state: string;
    type?: string;
}

export interface Candidate {
    id: number;
    name: string;
    party: string;
    constituency_id: number;
    incumbent: number;
}

export interface UserContext {
    user: Partial<User> | null;
    constituency?: Constituency;
    representatives?: Candidate[];
    electionData?: any;
}

export interface ChatSessionRow {
    id: number;
    user_id: number;
    history: string;
    updated_at: string;
}

export interface VoteRow {
    id: number;
    user_id: number;
    election_id: string;
    timestamp: string;
}
