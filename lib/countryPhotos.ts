import { ImageSourcePropType } from 'react-native';

const defaultCountryPhoto = require('../assets/images/BackHome.png');

const countryPhotoRegistry: Record<string, ImageSourcePropType> = {
    israel: require('../assets/country-photos/Israel.jpg'),
    italy: require('../assets/country-photos/Italy.jpg'),
};

const normalizeCountryKey = (countryName: string) =>
    countryName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');

export const getCountryPhoto = (countryName: string): ImageSourcePropType =>
    countryPhotoRegistry[normalizeCountryKey(countryName)] ?? defaultCountryPhoto;
