// Tests for useFileSelection: the file/folder multi-select state used by
// FileListScreen (toggle, select-all/clear-all, and the isSelected lookup).
// No hidden dependencies (pure useState/useCallback) — no mocking needed.

import { renderHook, act } from '@testing-library/react-native';
import useFileSelection from '../useFileSelection';

describe('useFileSelection', () => {
  it('starts with an empty selection', () => {
    const { result } = renderHook(() => useFileSelection());
    expect(result.current.selectedFiles).toEqual([]);
    expect(result.current.isSelected('a')).toBe(false);
  });

  describe('toggleSelection', () => {
    it('adds an id that is not yet selected', () => {
      const { result } = renderHook(() => useFileSelection());
      act(() => result.current.toggleSelection('a'));
      expect(result.current.selectedFiles).toEqual(['a']);
      expect(result.current.isSelected('a')).toBe(true);
    });

    it('removes an id that is already selected', () => {
      const { result } = renderHook(() => useFileSelection());
      act(() => result.current.toggleSelection('a'));
      act(() => result.current.toggleSelection('a'));
      expect(result.current.selectedFiles).toEqual([]);
      expect(result.current.isSelected('a')).toBe(false);
    });

    it('preserves other selected ids, appending new ones in call order', () => {
      const { result } = renderHook(() => useFileSelection());
      act(() => result.current.toggleSelection('a'));
      act(() => result.current.toggleSelection('b'));
      expect(result.current.selectedFiles).toEqual(['a', 'b']);

      // Toggling 'a' off must not disturb 'b'.
      act(() => result.current.toggleSelection('a'));
      expect(result.current.selectedFiles).toEqual(['b']);
    });
  });

  describe('selectAll', () => {
    const shownFiles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    it('selects every id from the given shown files when not all are already selected', () => {
      const { result } = renderHook(() => useFileSelection());
      act(() => result.current.selectAll(shownFiles));
      expect(result.current.selectedFiles).toEqual(['a', 'b', 'c']);
    });

    it('clears the selection when every shown file is already selected (toggle-all-off)', () => {
      const { result } = renderHook(() => useFileSelection());
      act(() => result.current.selectAll(shownFiles));
      act(() => result.current.selectAll(shownFiles));
      expect(result.current.selectedFiles).toEqual([]);
    });

    it('replaces (not merges with) a partial selection whose size differs from shownFiles.length', () => {
      const { result } = renderHook(() => useFileSelection());
      act(() => result.current.toggleSelection('a'));
      act(() => result.current.selectAll(shownFiles));
      expect(result.current.selectedFiles).toEqual(['a', 'b', 'c']);
    });
  });

  it('clearSelection empties a non-empty selection', () => {
    const { result } = renderHook(() => useFileSelection());
    act(() => result.current.toggleSelection('a'));
    act(() => result.current.toggleSelection('b'));
    act(() => result.current.clearSelection());
    expect(result.current.selectedFiles).toEqual([]);
  });

  it('isSelected re-derives from the latest selectedFiles after each mutation', () => {
    const { result } = renderHook(() => useFileSelection());
    act(() => result.current.toggleSelection('x'));
    expect(result.current.isSelected('x')).toBe(true);
    expect(result.current.isSelected('y')).toBe(false);

    act(() => result.current.toggleSelection('x'));
    expect(result.current.isSelected('x')).toBe(false);
  });
});
