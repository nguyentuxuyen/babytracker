// Placeholder useFirestore hook - not connected to Firebase

const useFirestore = (collectionName: string) => {
    const addDocument = async (data: any) => {
        console.log(`Mock addDocument to ${collectionName}:`, data);
        return { id: 'mock-doc-id', ...data };
    };

    const updateDocument = async (id: string, data: any) => {
        console.log(`Mock updateDocument in ${collectionName}:`, id, data);
        return true;
    };

    const deleteDocument = async (id: string) => {
        console.log(`Mock deleteDocument from ${collectionName}:`, id);
        return true;
    };

    const getDocuments = async () => {
        console.log(`Mock getDocuments from ${collectionName}`);
        return [];
    };

    return {
        documents: [],
        loading: false,
        error: null,
        addDocument,
        updateDocument,
        deleteDocument,
        getDocuments
    };
};

export default useFirestore;