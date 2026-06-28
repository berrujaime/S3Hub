// src/screens/SettingsScreen.js
import React, { useContext } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import i18n from '../locales/translations';
import { Picker } from '@react-native-picker/picker';
import Constants from 'expo-constants';

export default function SettingsScreen() {
    const theme = useTheme();

    const languages = [
        { label: 'English', value: 'en' },
        { label: 'Español', value: 'es' },
    ];

    const themes = [
        { label: i18n.t('themeSystem'), value: 'system' },
        { label: i18n.t('themeLight'), value: 'light' },
        { label: i18n.t('themeDark'), value: 'dark' },
    ];

    const { language, changeLanguage } = useContext(AuthContext);
    const { preview, changePreview } = useContext(AuthContext);
    const { theme: themePreference, changeTheme } = useContext(AuthContext);

    const privacyPolicyUrl = Constants.expoConfig?.extra?.privacyPolicyUrl;

    const handleLanguageChange = (value) => {
        changeLanguage(value);
    };

    const handlePreviewChange = (value) => {
        changePreview(value);
    };

    const handleThemeChange = (value) => {
        changeTheme(value);
    };

    const handlePrivacyPolicy = () => {
        if (privacyPolicyUrl) {
            Linking.openURL(privacyPolicyUrl);
        }
    };

    const pickerColor = theme.colors.onSurface;
    const pickerContainerStyle = [
        styles.pickerContainer,
        { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface },
    ];
    const pickerStyle = [styles.picker, { color: pickerColor }];
    const pickerItemStyle = { color: pickerColor };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onBackground }]}>{i18n.t('settings')}</Text>

            <Text style={[styles.label, { color: theme.colors.onBackground }]}>{i18n.t('selectLanguage')}</Text>
            <View style={pickerContainerStyle}>
                <Picker
                    selectedValue={language}
                    onValueChange={(itemValue) => handleLanguageChange(itemValue)}
                    style={pickerStyle}
                    dropdownIconColor={pickerColor}
                    itemStyle={pickerItemStyle}
                >
                    {languages.map(lang => (
                        <Picker.Item key={lang.value} label={lang.label} value={lang.value} color={pickerColor} />
                    ))}
                </Picker>
            </View>

            <Text style={[styles.label, { color: theme.colors.onBackground }]}>{i18n.t('selectPreview')}</Text>
            <View style={pickerContainerStyle}>
                <Picker
                    selectedValue={preview}
                    onValueChange={(itemValue) => handlePreviewChange(itemValue)}
                    style={pickerStyle}
                    dropdownIconColor={pickerColor}
                    itemStyle={pickerItemStyle}
                >
                    <Picker.Item key={i18n.t('optionYes')} label={i18n.t('optionYes')} value={"true"} color={pickerColor} />
                    <Picker.Item key={i18n.t('optionNo')} label={i18n.t('optionNo')} value={"false"} color={pickerColor} />
                </Picker>
            </View>

            <Text style={[styles.label, { color: theme.colors.onBackground }]}>{i18n.t('selectTheme')}</Text>
            <View style={pickerContainerStyle}>
                <Picker
                    selectedValue={themePreference}
                    onValueChange={(itemValue) => handleThemeChange(itemValue)}
                    style={pickerStyle}
                    dropdownIconColor={pickerColor}
                    itemStyle={pickerItemStyle}
                >
                    {themes.map(item => (
                        <Picker.Item key={item.value} label={item.label} value={item.value} color={pickerColor} />
                    ))}
                </Picker>
            </View>

            {privacyPolicyUrl ? (
                <TouchableOpacity onPress={handlePrivacyPolicy} style={styles.privacyLink}>
                    <Text style={[styles.privacyText, { color: theme.colors.primary }]}>{i18n.t('privacyPolicy')}</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        marginTop: 24,
    },
    title: {
        marginBottom: 16,
        textAlign: 'center',
        fontSize: 24,
    },
    label: {
        marginBottom: 8,
        fontSize: 18,
    },
    pickerContainer: {
        borderWidth: 1,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 16,
    },
    picker: {
        height: 50,
        width: '100%',
    },
    privacyLink: {
        marginTop: 24,
        alignItems: 'center',
        padding: 12,
    },
    privacyText: {
        fontSize: 14,
        textDecorationLine: 'underline',
    },
});
