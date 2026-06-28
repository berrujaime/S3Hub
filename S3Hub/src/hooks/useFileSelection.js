import { useState, useCallback } from 'react';

// Encapsulates the file/folder selection state for the file list.
// Returns the selected ids plus helpers to mutate them, preserving the
// exact toggle/select-all semantics from the original FileListScreen.
export default function useFileSelection() {
  const [selectedFiles, setSelectedFiles] = useState([]);

  const toggleSelection = useCallback((id) => {
    setSelectedFiles((prevSelected) => {
      if (prevSelected.includes(id)) {
        return prevSelected.filter((fileId) => fileId !== id);
      } else {
        return [...prevSelected, id];
      }
    });
  }, []);

  // Select all currently shown items, or clear if everything is already selected.
  const selectAll = useCallback((shownFiles) => {
    setSelectedFiles((prevSelected) => {
      if (prevSelected.length === shownFiles.length) {
        return [];
      }
      return shownFiles.map((file) => file.id);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const isSelected = useCallback(
    (id) => selectedFiles.includes(id),
    [selectedFiles]
  );

  return { selectedFiles, toggleSelection, selectAll, clearSelection, isSelected };
}
