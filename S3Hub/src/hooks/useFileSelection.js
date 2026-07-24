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

  // Select all currently shown items, or clear if every shown item is
  // already selected. Compares MEMBERSHIP, not just count: a length-only
  // check (`prevSelected.length === shownFiles.length`) is wrongly satisfied
  // whenever the current selection happens to be the same SIZE as the shown
  // set but a DIFFERENT set of ids -- e.g. select N items, then a search
  // filters the list down to exactly N other items -- which would toggle
  // the selection off instead of selecting the shown files.
  const selectAll = useCallback((shownFiles) => {
    setSelectedFiles((prevSelected) => {
      const prevSelectedSet = new Set(prevSelected);
      const allShownAlreadySelected = shownFiles.every((file) => prevSelectedSet.has(file.id));
      if (allShownAlreadySelected) {
        return [];
      }
      return shownFiles.map((file) => file.id);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const isSelected = useCallback((id) => selectedFiles.includes(id), [selectedFiles]);

  return { selectedFiles, toggleSelection, selectAll, clearSelection, isSelected };
}
