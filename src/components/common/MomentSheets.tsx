import React, { useCallback, useState } from 'react';
import { Moment } from '../../firebase/moments';
import MomentEditorDialog from './MomentEditorDialog';
import MomentViewer from './MomentViewer';
import MomentImportDialog from './MomentImportDialog';

// View / add / edit flow shared by every page that shows moments.
export const useMomentSheets = (uid: string | undefined, moments: Moment[]) => {
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [editor, setEditor] = useState<{ moment: Moment | null; defaultDate?: Date } | null>(null);
    // Bulk import; `files` set when the editor hands over photos from several days or places.
    const [importer, setImporter] = useState<{ files: File[] | null } | null>(null);

    const openMoment = useCallback((moment: Moment) => setViewingId(moment.id), []);
    const addMoment = useCallback((defaultDate?: Date) => setEditor({ moment: null, defaultDate }), []);
    const importPhotos = useCallback(() => setImporter({ files: null }), []);

    // Read the viewed moment from the live list so edits and deletes show at once.
    const viewing = moments.find((moment) => moment.id === viewingId) || null;

    const sheets = uid ? (
        <>
            <MomentViewer
                open={Boolean(viewing) && !editor}
                onClose={() => setViewingId(null)}
                uid={uid}
                moment={viewing}
                onEdit={(moment) => setEditor({ moment })}
            />
            <MomentEditorDialog
                open={Boolean(editor)}
                onClose={() => setEditor(null)}
                uid={uid}
                moment={editor?.moment}
                defaultDate={editor?.defaultDate}
                onSaved={(moment) => setViewingId(moment.id)}
                onSplit={(files) => {
                    setEditor(null);
                    setImporter({ files });
                }}
            />
            <MomentImportDialog
                open={Boolean(importer)}
                onClose={() => setImporter(null)}
                uid={uid}
                initialFiles={importer?.files}
            />
        </>
    ) : null;

    return { openMoment, addMoment, importPhotos, sheets };
};
