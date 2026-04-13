import { ImageSourcePropType } from 'react-native';

const defaultCountryPhoto = require('../assets/images/BackHome.png');

const countryPhotoRegistry: Record<string, ImageSourcePropType> = {
    albania: require('../assets/country-photos/Albania.jpg'),
    andorra: require('../assets/country-photos/Andorra.jpg'),
    armenia: require('../assets/country-photos/Armenia.jpg'),
    austria: require('../assets/country-photos/Austria.jpg'),
    azerbaijan: require('../assets/country-photos/Azerbaijan.jpg'),
    belarus: require('../assets/country-photos/Belarus.jpg'),
    belgium: require('../assets/country-photos/Belgium.jpg'),
    bosnia: require('../assets/country-photos/Bosnia.jpg'),
    'bosnia-and-herzegovina': require('../assets/country-photos/Bosnia.jpg'),
    bulgaria: require('../assets/country-photos/Bulgaria.jpg'),
    croatia: require('../assets/country-photos/Croatia.jpg'),
    cyprus: require('../assets/country-photos/Cyprus.jpg'),
    'czech-republic': require('../assets/country-photos/Czech Republic.jpg'),
    denmark: require('../assets/country-photos/Denmark.jpg'),
    estonia: require('../assets/country-photos/Estonia.jpg'),
    finland: require('../assets/country-photos/Finland.jpg'),
    france: require('../assets/country-photos/France.jpg'),
    georgia: require('../assets/country-photos/Georgia.jpg'),
    germany: require('../assets/country-photos/Germany.jpg'),
    greece: require('../assets/country-photos/Greece.jpg'),
    hungary: require('../assets/country-photos/Hungary.jpg'),
    iceland: require('../assets/country-photos/Iceland.jpg'),
    ireland: require('../assets/country-photos/Ireland.jpg'),
    israel: require('../assets/country-photos/Israel.jpg'),
    italy: require('../assets/country-photos/Italy.jpg'),
    kazakhstan: require('../assets/country-photos/Kazakhstan.jpg'),
    kosovo: require('../assets/country-photos/Kosovo.jpg'),
    latvia: require('../assets/country-photos/Latvia.jpg'),
    liechtenstein: require('../assets/country-photos/Liechtenstein.jpg'),
    lithuania: require('../assets/country-photos/Lithuania.jpg'),
    luxembourg: require('../assets/country-photos/Luxembourg.jpg'),
    malta: require('../assets/country-photos/Malta.jpg'),
    moldova: require('../assets/country-photos/Moldova.jpg'),
    monaco: require('../assets/country-photos/Monaco.jpg'),
    montenegro: require('../assets/country-photos/Montenegro.jpg'),
    netherlands: require('../assets/country-photos/Netherlands.jpg'),
    'the-netherlands': require('../assets/country-photos/Netherlands.jpg'),
    norway: require('../assets/country-photos/Norway.jpg'),
    poland: require('../assets/country-photos/Poland.jpg'),
    portugal: require('../assets/country-photos/Portugal.jpg'),
    romania: require('../assets/country-photos/Romania.jpg'),
    'san-marino': require('../assets/country-photos/San Marino.jpg'),
    serbia: require('../assets/country-photos/Serbia.jpg'),
    slovakia: require('../assets/country-photos/Slovakia.jpg'),
    slovenia: require('../assets/country-photos/Slovenia.jpg'),
    spain: require('../assets/country-photos/Spain.jpg'),
    sweden: require('../assets/country-photos/Sweden.jpg'),
    switzerland: require('../assets/country-photos/Switzerland.jpg'),
    turkey: require('../assets/country-photos/Turkey.jpg'),
    ukraine: require('../assets/country-photos/Ukraine.jpg'),
    'united-kingdom': require('../assets/country-photos/United Kingdom.jpg'),
    'vatican-city': require('../assets/country-photos/Vatican City.jpg'),
    'new-york': require('../assets/country-photos/New York.jpg'),
};

const normalizeCountryKey = (countryName: string) =>
    countryName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');

export const getCountryPhoto = (countryName: string): ImageSourcePropType =>
    countryPhotoRegistry[normalizeCountryKey(countryName)] ?? defaultCountryPhoto;
