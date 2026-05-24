import { getCountryPhoto, defaultCountryPhoto } from '@/lib/countryPhotos';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
    countryName: string;
    memoCount: number;
    styles: {
        countryFolderBackground: object;
        countryFolderOverlay: object;
        countryFolderContent: object;
        countryFolderTitle: object;
        countryFolderCount: object;
    };
};

export default function CountryFolderBackground({ countryName, memoCount, styles }: Props) {
    const [source, setSource] = useState(() => getCountryPhoto(countryName));

    const onError = useCallback(() => {
        setSource(defaultCountryPhoto);
    }, []);

    return (
        <View style={styles.countryFolderBackground}>
            <ExpoImage
                source={source}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                cachePolicy="memory"
                transition={0}
                recyclingKey={`country-${countryName}`}
                onError={onError}
            />
            <View style={styles.countryFolderOverlay} />
            <View style={styles.countryFolderContent}>
                <Text style={styles.countryFolderTitle} numberOfLines={2}>
                    {countryName}
                </Text>
                <Text style={styles.countryFolderCount}>
                    {memoCount} memo{memoCount === 1 ? '' : 's'}
                </Text>
            </View>
        </View>
    );
}
