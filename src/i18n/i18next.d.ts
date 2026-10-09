import 'i18next';

// Matches `returnNull: false` in the init options so t() is typed as returning a string.
declare module 'i18next' {
    interface CustomTypeOptions {
        returnNull: false;
    }
}
