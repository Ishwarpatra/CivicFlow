/**
 * Firebase Admin SDK — Firestore data layer
 * Replaces SQLite for votes and sessions persistence across Cloud Run restarts.
 */
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let firestoreDb: Firestore | null = null;
let firebaseApp: App | null = null;

export function initFirebase(): Firestore | null {
    if (firestoreDb) return firestoreDb;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.warn('[Firebase] Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY — Firestore disabled, falling back to SQLite.');
        return null;
    }

    try {
        if (getApps().length === 0) {
            firebaseApp = initializeApp({
                credential: cert({ projectId, clientEmail, privateKey }),
                projectId,
            });
        } else {
            firebaseApp = getApps()[0];
        }
        firestoreDb = getFirestore(firebaseApp);
        console.info('[Firebase] Firestore connected to project:', projectId);
        return firestoreDb;
    } catch (e) {
        console.error('[Firebase] Initialization failed:', e);
        return null;
    }
}

export { firestoreDb };
