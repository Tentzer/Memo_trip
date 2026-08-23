import {
    fetchGooglePlaceDetails,
    fetchGooglePlacePredictions,
    type PlacePrediction,
} from '@/lib/googlePlaces';
import { latitudeForMarkerViewportCenter } from '@/lib/mapCamera';
import { fetchWalkingRoutePreview } from '@/lib/routing';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, Keyboard, Linking } from 'react-native';
import MapView from 'react-native-maps';
import { useAuth } from '../context/AuthContext';
import { Memory } from '../context/MemoryContext';

export type { PlacePrediction };

interface Coordinates {
    latitude: number;
    longitude: number;
}

type RecenterOptions = {
    /** Fetch a new GPS fix instead of reusing the last cached position. */
    forceRefresh?: boolean;
};

const USER_MAP_ZOOM_DELTA = 0.01;
const MEMO_MAP_ZOOM_DELTA = 0.005;

export const useMapLogic = (
    addPlaceMemory: (
        photoUri: string,
        lat: number,
        lng: number,
        country: string,
        description?: string,
        title?: string,
        options?: { customFolderIds?: string[] }
    ) => Promise<void>,
    onMarkerActionPress?: (memory: Memory) => void
) => {

    const mapRef = useRef<MapView>(null);
    const locationRef = useRef<Location.LocationObject | null>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PlacePrediction[]>([]);
    const [destinationLatitude, setDestinationLatitude] = useState(0);
    const [destinationLongitude, setDestinationLongitude] = useState(0);
    const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>();
    const [showRoute, setShowRoute] = useState(false);
    const [showSearchBar, setShowSearchBar] = useState(true);
    const [mapMoved, setMapMoved] = useState(false);
    const [userChoseAddress, setUserChoseAddress] = useState(false);
    const [routeDistance, setRouteDistance] = useState('');
    const [showMemories, setShowMemories] = useState(true);
    const [isGalleryVisible, setIsGalleryVisible] = useState(false);
    const [isCountryLibraryVisible, setIsCountryLibraryVisible] = useState(false);
    const [isShareMemoryVisible, setIsShareMemoryVisible] = useState(false);
    const [memoryToShare, setMemoryToShare] = useState<Memory | null>(null);
    const [shareRecipient, setShareRecipient] = useState('');
    const [selectedPlacePhotoRef, setSelectedPlacePhotoRef] = useState<string | null>(null);
    const [selectedPlaceCountry, setSelectedPlaceCountry] = useState<string | null>(null);
    const [isAddingPlace, setIsAddingPlace] = useState(false);
    const [isNoPhotoDescriptionVisible, setIsNoPhotoDescriptionVisible] = useState(false);
    const [missingPhotoDescription, setMissingPhotoDescription] = useState('');
    const [selectedPlaceTitle, setSelectedPlaceTitle] = useState<string | null>(null);

    const { user } = useAuth();
    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    const getLocation = useCallback(async (forceRefresh = false) => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            setLoading(false);
            return null;
        }
        if (!forceRefresh && locationRef.current) {
            return locationRef.current;
        }
        const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        locationRef.current = currentLocation;
        setLocation(currentLocation);
        setLoading(false);
        return currentLocation;
    }, []);

    useEffect(() => {
        void getLocation(true);
    }, [getLocation]);

    const animateMapTo = useCallback((
        lat: number,
        lng: number,
        latitudeDelta: number,
        centerMode: 'user' | 'memo-pin',
    ) => {
        const cameraLat = centerMode === 'memo-pin'
            ? latitudeForMarkerViewportCenter(lat, latitudeDelta)
            : lat;
        mapRef.current?.animateToRegion({
            latitude: cameraLat,
            longitude: lng,
            latitudeDelta,
            longitudeDelta: latitudeDelta,
        }, 500);
    }, []);

    const returnToStartingPoint = useCallback(async (options: RecenterOptions = {}) => {
        const forceRefresh = options.forceRefresh ?? false;
        const currentLocation = await getLocation(forceRefresh);
        if (mapRef.current && currentLocation) {
            animateMapTo(
                currentLocation.coords.latitude,
                currentLocation.coords.longitude,
                USER_MAP_ZOOM_DELTA,
                'user',
            );
        }
    }, [getLocation, animateMapTo]);

    const fetchPlaces = useCallback(async (text: string) => {
        setSearchQuery(text);
        setUserChoseAddress(false);
        setSelectedPlacePhotoRef(null);
        setSelectedPlaceCountry(null);
        if (text.length < 3) {
            setSearchResults([]);
            return;
        }
        try {
            const predictions = await fetchGooglePlacePredictions(text, GOOGLE_API_KEY);
            setSearchResults(predictions);
        } catch (error) {
            console.log(error);
        }
    }, [GOOGLE_API_KEY]);

    const handleSelectPlace = useCallback(async (placeId: string, description: string) => {
        const place = await fetchGooglePlaceDetails(placeId, description, GOOGLE_API_KEY);

        if (place) {
            setSelectedPlaceTitle(place.title);
            setSelectedPlacePhotoRef(place.photoReference);
            setSelectedPlaceCountry(place.country);
            setShowRoute(false);
            setDestinationLatitude(place.latitude);
            setDestinationLongitude(place.longitude);
            setSearchResults([]);
            setSearchQuery(description);
            setUserChoseAddress(true);
            Keyboard.dismiss();

            animateMapTo(place.latitude, place.longitude, USER_MAP_ZOOM_DELTA, 'memo-pin');
        }
    }, [GOOGLE_API_KEY, animateMapTo]);

    const getPlaceRoute = useCallback(async (lat?: number, lng?: number): Promise<boolean> => {
        if (!location?.coords) {
            Alert.alert('Location needed', 'Turn on location to preview a route.');
            return false;
        }

        const finalLat = lat !== undefined ? lat : destinationLatitude;
        const finalLng = lng !== undefined ? lng : destinationLongitude;
        if (!finalLat || !finalLng) {
            Alert.alert('No destination', 'Choose a place on the map first.');
            return false;
        }

        const origin = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
        const destination = { latitude: finalLat, longitude: finalLng };

        const result = await fetchWalkingRoutePreview(origin, destination, GOOGLE_API_KEY);

        if (!result.ok) {
            Alert.alert('Route unavailable', result.message);
            return false;
        }

        setRouteCoordinates(result.coordinates);
        setRouteDistance(result.distanceText);
        return true;
    }, [location, destinationLatitude, destinationLongitude, GOOGLE_API_KEY]);

    const openDrivingInWaze = useCallback(async (lat?: number, lng?: number) => {
        const finalLat = lat !== undefined ? lat : destinationLatitude;
        const finalLng = lng !== undefined ? lng : destinationLongitude;

        if (!finalLat || !finalLng) {
            Alert.alert('No destination selected');
            return;
        }

        const wazeDeepLink = `waze://?ll=${finalLat},${finalLng}&navigate=yes`;
        const wazeWebLink = `https://waze.com/ul?ll=${finalLat},${finalLng}&navigate=yes`;

        try {
            let openedNative = false;
            try {
                const canOpenWaze = await Linking.canOpenURL(wazeDeepLink);
                if (canOpenWaze) {
                    await Linking.openURL(wazeDeepLink);
                    openedNative = true;
                }
            } catch {
                try {
                    await Linking.openURL(wazeDeepLink);
                    openedNative = true;
                } catch {
                    // Fall through to web link.
                }
            }

            if (!openedNative) {
                await Linking.openURL(wazeWebLink);
            }
        } catch {
            Alert.alert('Could not open navigation app');
        }
    }, [destinationLatitude, destinationLongitude]);

    const handleStopRoute = useCallback(() => {
        setShowRoute(false);
        returnToStartingPoint();
        setShowSearchBar(true);
        setRouteDistance('');
        setDestinationLatitude(0);
        setDestinationLongitude(0);
        setUserChoseAddress(false);
    }, [returnToStartingPoint]);

    const handleMarkerPress = useCallback((memory: Memory) => {
        setDestinationLatitude(memory.latitude);
        setDestinationLongitude(memory.longitude);
        setUserChoseAddress(false);
        setMemoryToShare(memory);
        onMarkerActionPress?.(memory);
    }, [onMarkerActionPress]);

    const handleClearSearch = useCallback(() => {
        setSearchQuery('');
        setSearchResults([]);
        setUserChoseAddress(false);
        setSelectedPlacePhotoRef(null);
        setSelectedPlaceCountry(null);
        setIsNoPhotoDescriptionVisible(false);
        setMissingPhotoDescription('');
        setSelectedPlaceTitle(null);
    }, []);

    const saveSelectedPlaceMemory = useCallback(async (description?: string) => {
        if (!user) {
            Alert.alert('Sign in required', 'Please sign in to save memories.');
            return;
        }

        const PLACEHOLDER_URL = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';
        const photoUri = selectedPlacePhotoRef
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${selectedPlacePhotoRef}&key=${GOOGLE_API_KEY}`
            : PLACEHOLDER_URL;

        const country = selectedPlaceCountry ?? '';

        setIsAddingPlace(true);
        try {
            await addPlaceMemory(photoUri, destinationLatitude, destinationLongitude, country, description, selectedPlaceTitle ?? undefined);
            handleClearSearch();
        } catch {
            Alert.alert('Error', 'Could not save the memory. Please try again.');
        } finally {
            setIsAddingPlace(false);
        }
    }, [
        user,
        selectedPlacePhotoRef,
        selectedPlaceCountry,
        destinationLatitude,
        destinationLongitude,
        GOOGLE_API_KEY,
        selectedPlaceTitle,
        addPlaceMemory,
        handleClearSearch,
    ]);

    const addSelectedPlaceAsMemory = useCallback(async () => {
        if (!selectedPlacePhotoRef) {
            setMissingPhotoDescription('');
            setIsNoPhotoDescriptionVisible(true);
            return;
        }
        await saveSelectedPlaceMemory();
    }, [selectedPlacePhotoRef, saveSelectedPlaceMemory]);

    const closeNoPhotoDescriptionPrompt = useCallback(() => {
        setIsNoPhotoDescriptionVisible(false);
    }, []);

    const saveNoPhotoPlaceWithoutDescription = useCallback(async () => {
        setIsNoPhotoDescriptionVisible(false);
        await saveSelectedPlaceMemory();
    }, [saveSelectedPlaceMemory]);

    const saveNoPhotoPlaceWithDescription = useCallback(async () => {
        const description = missingPhotoDescription.trim();
        setIsNoPhotoDescriptionVisible(false);
        await saveSelectedPlaceMemory(description);
    }, [missingPhotoDescription, saveSelectedPlaceMemory]);

    const jumpToLocation = useCallback((lat: number, lng: number) => {
        setIsGalleryVisible(false);
        setIsCountryLibraryVisible(false);

        InteractionManager.runAfterInteractions(() => {
            animateMapTo(lat, lng, MEMO_MAP_ZOOM_DELTA, 'memo-pin');
        });
    }, [animateMapTo]);

    return {
        mapRef, location, loading, searchQuery, searchResults,
        destinationLatitude, destinationLongitude, routeCoordinates,
        showRoute, showSearchBar, mapMoved, userChoseAddress, routeDistance,
        showMemories, isGalleryVisible, isCountryLibraryVisible, isShareMemoryVisible, memoryToShare, shareRecipient,
        isAddingPlace, isNoPhotoDescriptionVisible, missingPhotoDescription,
        setShowMemories, setShareRecipient,
        setSearchQuery, setMapMoved, fetchPlaces, handleSelectPlace, setIsShareMemoryVisible,
        getPlaceRoute, openDrivingInWaze, handleMarkerPress, handleStopRoute, returnToStartingPoint, setMemoryToShare,
        setShowRoute, setShowSearchBar, setUserChoseAddress, setRouteDistance,
        setDestinationLatitude, setDestinationLongitude, setIsGalleryVisible, setIsCountryLibraryVisible, jumpToLocation,
        handleClearSearch, addSelectedPlaceAsMemory,
        setMissingPhotoDescription, closeNoPhotoDescriptionPrompt,
        saveNoPhotoPlaceWithoutDescription, saveNoPhotoPlaceWithDescription,
    };
};