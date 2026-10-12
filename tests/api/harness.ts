// Loads a CommonJS Vercel function from api/ with its Firebase Admin, auth and
// web-push modules replaced by in-memory fakes (vi.mock does not reach require()).
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const apiDir = path.resolve(__dirname, '../../api');

export const SERVER_TIMESTAMP = { __serverTimestamp: true };

type Doc = Record<string, any>;

/** Minimal Firestore: documents keyed by full path, enough for the handlers. */
export function createFakeDb() {
    const docs = new Map<string, Doc>();
    let autoId = 0;

    const docRef = (docPath: string): any => ({
        id: docPath.split('/').pop(),
        path: docPath,
        get: async () => ({ exists: docs.has(docPath), data: () => docs.get(docPath) }),
        set: async (data: Doc, options?: { merge?: boolean }) => {
            docs.set(docPath, options?.merge ? { ...docs.get(docPath), ...data } : { ...data });
        },
        update: async (data: Doc) => {
            docs.set(docPath, { ...docs.get(docPath), ...data });
        },
        delete: async () => {
            docs.delete(docPath);
        },
        collection: (name: string) => collectionRef(`${docPath}/${name}`)
    });

    const snapshotOf = (paths: string[]) => {
        const found = paths.map((p) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => docs.get(p) }));
        return { docs: found, empty: found.length === 0, size: found.length, forEach: (fn: any) => found.forEach(fn) };
    };

    const collectionRef = (collectionPath: string, filters: Array<[string, unknown]> = []): any => ({
        doc: (id?: string) => docRef(`${collectionPath}/${id ?? `auto-${++autoId}`}`),
        where: (field: string, _op: string, value: unknown) => collectionRef(collectionPath, [...filters, [field, value]]),
        get: async () => snapshotOf([...docs.keys()].filter((p) => {
            const rest = p.slice(collectionPath.length + 1);
            return p.startsWith(`${collectionPath}/`) && !rest.includes('/')
                && filters.every(([field, value]) => docs.get(p)?.[field] === value);
        }))
    });

    return {
        docs,
        collection: (name: string) => collectionRef(name),
        runTransaction: async (fn: (transaction: any) => Promise<unknown>) => fn({
            get: (ref: any) => ref.get(),
            set: (ref: any, data: Doc, options?: { merge?: boolean }) => ref.set(data, options)
        }),
        collectionGroup: (name: string) => ({
            get: async () => snapshotOf([...docs.keys()].filter((p) => p.split('/').slice(-2, -1)[0] === name))
        })
    };
}

export type FakeDb = ReturnType<typeof createFakeDb>;

export const fakeAdmin = {
    apps: [{}],
    firestore: { FieldValue: { serverTimestamp: () => SERVER_TIMESTAMP } }
};

type Fakes = {
    db?: FakeDb | null;
    /** uid returned for a valid bearer token; requests without one get 401. */
    uid?: string;
    sendNotification?: (subscription: unknown, payload: string) => Promise<unknown>;
    vapidConfigured?: boolean;
};

const stub = (name: string, exports: unknown) => {
    const file = path.join(apiDir, name);
    require.cache[file] = { id: file, filename: file, loaded: true, exports } as any;
};

export function loadHandler(name: string, fakes: Fakes = {}) {
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(apiDir)) delete require.cache[key];
    }
    const db = fakes.db === undefined ? createFakeDb() : fakes.db;
    stub('_admin.js', { admin: fakeAdmin, db, adminInitError: null, isAdminReady: !!db });
    stub('_auth.js', {
        verifyUserFromRequest: async (req: any) => {
            if (req.headers.authorization !== 'Bearer good-token' || !fakes.uid) throw new Error('invalid token');
            return { uid: fakes.uid };
        }
    });
    stub('_push.js', {
        webpush: { sendNotification: fakes.sendNotification ?? (async () => ({ statusCode: 201 })) },
        configureWebPush: () => {
            if (fakes.vapidConfigured === false) throw new Error('Missing VAPID');
        }
    });
    return require(path.join(apiDir, name)) as (req: any, res: any) => Promise<void>;
}

export function createResponse() {
    const res = {
        statusCode: 0,
        body: undefined as any,
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json(body: unknown) {
            res.body = body;
            return res;
        }
    };
    return res;
}

export async function call(handler: (req: any, res: any) => Promise<void>, req: { method?: string; headers?: Record<string, string>; body?: unknown }) {
    const res = createResponse();
    await handler({ method: 'POST', headers: {}, ...req }, res);
    return res;
}
