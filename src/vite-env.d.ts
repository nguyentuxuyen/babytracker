/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string;
    readonly REACT_APP_VERSION?: string;
    readonly REACT_APP_VAPID_PUBLIC_KEY?: string;
    readonly VITE_VAPID_PUBLIC_KEY?: string;
    readonly VITE_FIREBASE_EMULATORS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
