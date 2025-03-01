// src/screens/SettingsScreen.js
import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import i18n from '../locales/translations';
import { Picker } from '@react-native-picker/picker';

export default function SettingsScreen() {
    const languages = [
        { label: 'English', value: 'en' },
        { label: 'Español', value: 'es' },
    ];

    const { language, changeLanguage } = useContext(AuthContext);
    const { preview, changePreview } = useContext(AuthContext);

    const handleLanguageChange = (value) => {
        changeLanguage(value);
    };

    const handlePreviewChange = (value) => {
        changePreview(value);
    };

    return (
        <View style={styles.container}>
            <Text variant="headlineLarge" style={styles.title}>{i18n.t('settings')}</Text>
            <Text style={styles.label}>{i18n.t('selectLanguage')}</Text>
            <View style={styles.pickerContainer}>
                <Picker
                    selectedValue={language}
                    onValueChange={(itemValue) => handleLanguageChange(itemValue)}
                    style={styles.picker}
                >
                    {languages.map(lang => (
                        <Picker.Item key={lang.value} label={lang.label} value={lang.value} />
                    ))}
                </Picker>
            </View>
            <Text style={styles.label}>{i18n.t('selectPreview')}</Text>
            <View style={styles.pickerContainer}>
            <Picker
                    selectedValue={preview}
                    onValueChange={(itemValue) => handlePreviewChange(itemValue)}
                    style={styles.picker}
                >
                        <Picker.Item key={i18n.t('optionYes')} label={i18n.t('optionYes')} value={"true"} />
                        <Picker.Item key={i18n.t('optionNo')} label={i18n.t('optionNo')} value={"false"} />
                </Picker>
            </View>
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
        borderColor: '#ccc',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 16,
    },
    picker: {
        height: 50,
        width: '100%',
    },
});
