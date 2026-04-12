import React, { useState, useEffect, useRef } from 'react';
import {Keyboard, Alert, Linking, SafeAreaView, View, Text, TouchableOpacity, FlatList, Image, Modal} from 'react-native';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import polyline from '@mapbox/polyline';
import { Memory } from '../context/MemoryContext';
import {supabase} from "@/lib/supabase";
import {Ionicons} from "@expo/vector-icons";

interface Coordinates {
    latitude: number;
    longitude: number;
}

// Utility for decoding polyline
const decodePolyline = (encoded: string) => {
    const points = polyline.decode(encoded);
    return points.map(point => ({
        latitude: point[0],
        longitude: point[1],
    }));
};

export const useMapLogic = (
    deleteMemory: (id: string) => void,
    onInfoPress?: (memory: Memory) => void
) => {

    const mapRef = useRef<MapView>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [google_result, SetGoogleResults] = useState([]);
    const [destination_latitue, setDestinationlatitue] = useState<number>(0);
    const [destination_longtitude, setDestinationlongtitude] = useState<number>(0);
    const [route_coordinates, setRouteCoordinates] = useState<Coordinates[]>();
    const [show_route, setShowRoute] = useState<boolean>(false);
    const [show_SearchingBar, setShowSearchingBar] = useState<boolean>(true);
    const [map_Moved, setMapMoved] = useState<boolean>(false);
    const [userChooseAdress, setUserChooseAdress] = useState<boolean>(false);
    const [routeDistance, setRouteDistance] = useState<string>('');
    const [showMemories, setShowMemories] = useState<boolean>(true);
    const [isGalleryVisible, setIsGalleryVisible] = useState<boolean>(false);
    const [isShareMemoryVisible, setIsShareMemoryVisible] = useState<boolean>(false);
    const [memoryToShare, setMemoryToShare] = useState<Memory | null>(null);
    const [shareEmail, setShareEmail] = useState<string>('');
    const [isDarkMode, setIsDarkMode] = useState(false);

    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    const GetLocation = async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            setLoading(false);
            return null;
        }
        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        setLoading(false);
        return currentLocation;
    };

    const returnToStartingPoint = async () => {
        const currentLocation = await GetLocation();
        if (mapRef.current && currentLocation) {
            mapRef.current.animateToRegion({
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 500);
        }
    };

    const fetchPlaces = async (text: string) => {
        setSearchQuery(text);
        if (text.length < 3) {
            SetGoogleResults([]);
            return;
        }
        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${text}&key=${GOOGLE_API_KEY}`);
            const json = await response.json();
            SetGoogleResults(json.predictions);
        } catch (error) {
            console.log(error);
        }
    };

    const handleSelectPlace = async (place_id: string, description: string) => {
        const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=geometry&key=${GOOGLE_API_KEY}`);
        const data = await response.json();

        if (data.result && data.result.geometry) {
            const lat = data.result.geometry.location.lat;
            const lng = data.result.geometry.location.lng;

            setShowRoute(false);
            setDestinationlatitue(lat);
            setDestinationlongtitude(lng);
            SetGoogleResults([]);
            setSearchQuery(description);
            setUserChooseAdress(true);
            Keyboard.dismiss();

            mapRef.current?.animateToRegion({
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 1000);
        }
    };

    const GetPlaceRoute = async (lat?: number, lng?: number) => {
        const origin = `${location?.coords.latitude},${location?.coords.longitude}`;
        const finalLat = lat !== undefined ? lat : destination_latitue;
        const finalLng = lng !== undefined ? lng : destination_longtitude;
        const destination = `${finalLat},${finalLng}`;

        const directionsResponse = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=walking&key=${GOOGLE_API_KEY}`
        );

        const directionsData = await directionsResponse.json();
        if (directionsData.routes.length > 0) {
            const encodedPath = directionsData.routes[0].overview_polyline.points;
            const decodedPath = decodePolyline(encodedPath);
            setRouteCoordinates(decodedPath);
            setRouteDistance(directionsData.routes[0].legs[0].distance.text);
        }
    };

    const openDrivingInWaze = async (lat?: number, lng?: number) => {
        const finalLat = lat !== undefined ? lat : destination_latitue;
        const finalLng = lng !== undefined ? lng : destination_longtitude;

        if (!finalLat || !finalLng) {
            Alert.alert('No destination selected');
            return;
        }

        const wazeDeepLink = `waze://?ll=${finalLat},${finalLng}&navigate=yes`;
        const wazeWebLink = `https://waze.com/ul?ll=${finalLat},${finalLng}&navigate=yes`;

        try {
            const canOpenWaze = await Linking.canOpenURL(wazeDeepLink);
            if (canOpenWaze) {
                await Linking.openURL(wazeDeepLink);
                return;
            }

            await Linking.openURL(wazeWebLink);
        } catch (error) {
            Alert.alert('Could not open navigation app');
        }
    };

    const handleStopRoute = () => {
        setShowRoute(false);
        returnToStartingPoint();
        setShowSearchingBar(true);
        setRouteDistance('');
        setDestinationlatitue(0);
        setDestinationlongtitude(0);
        setUserChooseAdress(false);
    };

    const handleMarkerPress = (memory: Memory) => {
        setDestinationlatitue(memory.latitude);
        setDestinationlongtitude(memory.longitude);
        setUserChooseAdress(false);
        setMemoryToShare(memory);

        Alert.alert(
            "Memo Options",
            "What would you like to do?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", onPress: () => deleteMemory(memory.id), style: "destructive" },
                {
                    text: "Route",
                    onPress: () => {
                        Alert.alert(
                            'Choose route type',
                            'How would you like to navigate?',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Walk',
                                    onPress: () => {
                                        GetPlaceRoute(memory.latitude, memory.longitude);
                                        setShowRoute(true);
                                        returnToStartingPoint();
                                        setShowSearchingBar(false);
                                    },
                                },
                                {
                                    text: 'Drive with Waze',
                                    onPress: () => {
                                        openDrivingInWaze(memory.latitude, memory.longitude);
                                    },
                                },
                            ]
                        );
                    },
                    style: "default",
                },
                {
                    text: "Info",
                    onPress: () => {
                        onInfoPress?.(memory);
                    },
                },
                { text: "Share", onPress: () => {
                    setIsShareMemoryVisible(true);
                    setMemoryToShare(memory);
                    } }
            ]
        );
    };

    const jumpToLocation = (lat : number , lng: number) => {
        setIsGalleryVisible(false);

        setTimeout(() => {
            mapRef.current?.animateToRegion({
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            }, 500);
        }, 200);
    }

    return {
        mapRef, location, loading, searchQuery, google_result,
        destination_latitue, destination_longtitude, route_coordinates,
        show_route, show_SearchingBar, map_Moved, userChooseAdress, routeDistance,showMemories,isGalleryVisible,isShareMemoryVisible,memoryToShare,shareEmail,isDarkMode,
        setShowMemories,setShareEmail,setIsDarkMode,
        setSearchQuery, setMapMoved, fetchPlaces, handleSelectPlace,setIsShareMemoryVisible,
        GetPlaceRoute, openDrivingInWaze, handleMarkerPress, handleStopRoute, returnToStartingPoint,setMemoryToShare,
        setShowRoute, setShowSearchingBar, setUserChooseAdress, setRouteDistance, setDestinationlatitue, setDestinationlongtitude,setIsGalleryVisible,jumpToLocation,
    };
};