// src/components/__tests__/ProviderSpine.test.js
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import ProviderSpine, { RegionTag } from '../ProviderSpine';
import { darkTheme } from '../../theme/theme';
import { PROVIDERS } from '../../domain/providers';

const renderWithTheme = (children) =>
  render(<PaperProvider theme={darkTheme}>{children}</PaperProvider>);

describe('ProviderSpine', () => {
  it("tints the bar with the provider's registry brand color", () => {
    renderWithTheme(<ProviderSpine providerId="aws" />);
    const spine = screen.getByTestId('provider-spine');

    expect(StyleSheet.flatten(spine.props.style).backgroundColor).toBe(
      PROVIDERS.aws.brandColor
    );
  });

  it('falls back to the theme primary color for an unknown provider id', () => {
    renderWithTheme(<ProviderSpine providerId="not-a-real-provider" />);
    const spine = screen.getByTestId('provider-spine');

    expect(StyleSheet.flatten(spine.props.style).backgroundColor).toBe(
      darkTheme.colors.primary
    );
  });

  it('falls back to the theme primary color for the custom provider (no brandColor)', () => {
    renderWithTheme(<ProviderSpine providerId="custom" />);
    const spine = screen.getByTestId('provider-spine');

    expect(StyleSheet.flatten(spine.props.style).backgroundColor).toBe(
      darkTheme.colors.primary
    );
  });

  it('falls back to the theme primary color when no providerId is given at all', () => {
    renderWithTheme(<ProviderSpine />);
    const spine = screen.getByTestId('provider-spine');

    expect(StyleSheet.flatten(spine.props.style).backgroundColor).toBe(
      darkTheme.colors.primary
    );
  });

  it('does not intercept touches (row remains pressable underneath it)', () => {
    renderWithTheme(<ProviderSpine providerId="aws" />);
    expect(screen.getByTestId('provider-spine').props.pointerEvents).toBe(
      'none'
    );
  });
});

describe('RegionTag', () => {
  it('renders the region/endpoint value in the theme mono font, colored onSurfaceVariant', () => {
    renderWithTheme(<RegionTag value="eu-west-1" />);
    const tag = screen.getByTestId('region-tag');
    const flatStyle = StyleSheet.flatten(tag.props.style);

    expect(screen.getByText('eu-west-1')).toBeTruthy();
    expect(flatStyle.fontFamily).toBe(darkTheme.fonts.mono.regular.fontFamily);
    expect(flatStyle.color).toBe(darkTheme.colors.onSurfaceVariant);
  });

  it('renders nothing when given no value', () => {
    renderWithTheme(<RegionTag value={undefined} />);
    expect(screen.queryByTestId('region-tag')).toBeNull();
  });

  it('renders nothing for an empty string value', () => {
    renderWithTheme(<RegionTag value="" />);
    expect(screen.queryByTestId('region-tag')).toBeNull();
  });
});
