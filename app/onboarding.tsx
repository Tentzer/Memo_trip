import {Dimensions, View, ActivityIndicator, Text, TouchableOpacity, TextInput, Keyboard, Image} from 'react-native';
import MapView, {PROVIDER_GOOGLE, Marker, Polyline} from 'react-native-maps';
import React, {useEffect, useRef, useState} from 'react';
import * as Location from 'expo-location'; //
import {Ionicons} from '@expo/vector-icons';
import polyline from '@mapbox/polyline';

const {width, height} = Dimensions.get('window');

interface Coordinates {
    latitude: number;
    longitude: number;
}

const decodePolyline = (encoded: string) => {
    const points = polyline.decode(encoded);
    return points.map(point => ({
        latitude: point[0],
        longitude: point[1],
    }))
}

export default function MapScreen() {
    const mapRef = useRef<MapView>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [google_result, SetGoogleResults] = useState([]);
    const [place_latitude, setPlace_latitude] = useState<number>(0);
    const [place_longitude, setPlace_longitude] = useState<number>(0);
    const [route_coordinates, setRouteCoordinates] = useState<Coordinates[]>();
    const [show_route, setShowRoute] = useState<boolean>(false);
    const [show_SearchingBar, setShowSearchingBar] = useState<boolean>(true);
    const [map_Moved, setMapMoved] = useState<boolean>(false);
    const [userChooseAdress , setUserChooseAdress] = useState<boolean>(false);



    const GetLocation = async () => {
        let {status} = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            setLoading(false);
            return null;

        }

        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        setLoading(false);
        return currentLocation;
    }

    const fetchPlaces = async (text: string) => {
        setSearchQuery(text);
        if (text.length < 3) {
            SetGoogleResults([]);
            return;
        }

        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${text}&key=AIzaSyATswmwEuFQvLI9ixSJSF3pUVABYe8CTow`);
            const json = await response.json();
            SetGoogleResults(json.predictions);
        } catch (error) {
            console.log(error);
        }
    }

    const returnToStartingPoint = async () => {
        const currentLocation = await GetLocation();

        if (mapRef.current && currentLocation) {
            mapRef.current.animateToRegion({
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 1000);
        } else {
            console.warn("Location or Map not ready yet");
        }
    };

    useEffect(() => {
        returnToStartingPoint();
    }, []);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-slate-50">
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    const handleSelectPlace = async (place_id: string, description: string) => {
        // Change 'autocomplete' to 'details'
        const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=geometry&key=AIzaSyATswmwEuFQvLI9ixSJSF3pUVABYe8CTow`);
        const data = await response.json();

        if (data.result && data.result.geometry) {
            const lat = data.result.geometry.location.lat;
            const lng = data.result.geometry.location.lng;

            setShowRoute(false);
            setPlace_latitude(lat);
            setPlace_longitude(lng);
            SetGoogleResults([]);
            setSearchQuery(description);
            Keyboard.dismiss();

            if (mapRef.current && location) {
                mapRef.current.animateToRegion({
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                }, 1000);
            }
        }
    }

    const GetPlaceRoute = async () => {
        const origin = `${location?.coords.latitude},${location?.coords.longitude}`;
        const destination = `${place_latitude},${place_longitude}`;

        const directionsResponse = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=walking&key=AIzaSyATswmwEuFQvLI9ixSJSF3pUVABYe8CTow`
        );

        const directionsData = await directionsResponse.json();
        if (directionsData.routes.length > 0) {
            const encodedPath = directionsData.routes[0].overview_polyline.points;
            const decodedPath = decodePolyline(encodedPath);
            setRouteCoordinates(decodedPath);
        }
    }


    // @ts-ignore
    return (
        <View className="flex-1 items-center bg-slate-50">

            <View className="absolute top-5 px-5 left-0 right-0 z-50">

                {show_SearchingBar && (
                    <View className=" flex-row items-center bg-white h-12 rounded-2xl px-4 shadow-lg
                    " style={{
                        // iOS Shadow Properties
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2, // Lower this number (e.g., 0.03) for an even lighter shadow
                        shadowRadius: 10,

                        // Android Shadow Property
                        elevation: 2, // Low elevation = lighter shadow on Android
                    }}>
                        {/* Search Icon */}
                        <View className="absolute left-4 mt-2">
                            <Ionicons name="search" size={20} color="#64748b"/>
                        </View>

                        {/* The Input Field */}
                        <TextInput
                            className="flex-1 text-align text-slate-800 font-medium ml-10"
                            placeholder="Where to next, Traveler?"
                            placeholderTextColor="#94a3b8"
                            value={searchQuery}
                            onChangeText={fetchPlaces}//FetchPlaces function for using google API and reciving adresses
                            returnKeyType="search"
                        />

                        {/* Clear Button (Only shows if there is text) */}
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={20} color="#cbd5e1"/>
                            </TouchableOpacity>
                        )}
                    </View>
                )}


                {/* Drop DOWN!! */}
                {google_result.length > 0 && (
                    <View className="bg-white mt-2 rounded-2xl shadow-xl overflow-hidden">
                        {
                            google_result.map((item: any) => (
                                <TouchableOpacity
                                    key={item.place_id}
                                    className="p-4 border-b border-slate-100 active:bg-slate-50"
                                    onPress={() =>{handleSelectPlace(item.place_id , item.description) ; setUserChooseAdress(true)}}
                                ><Text className="text-slate-800">{item.description}</Text></TouchableOpacity>
                            ))}
                    </View>
                )}
            </View>


            {/* 1. Wrap the map in a container with a fixed height */}
            <View className="  h-[680] w-full rounded-3xl overflow-hidden shadow-lg border-white  ">

                <MapView

                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={{flex: 1}}
                    onPanDrag={() => setMapMoved(true)}
                    showsUserLocation={true}
                    // @ts-ignore
                    userTrackingMode="followWithHeading"
                    onMapReady={() => {
                        console.log("Map is ready, checking heading...");
                    }}
                    showsCompass={true}          // Shows compass only when map is rotated
                    rotateEnabled={true}         // MUST be true for the cone to appear
                    showsUserLocationHeading={true} // <--- Specific prop for the blue cone beam!
                    showsPointsOfInterest={true}
                    initialRegion={{
                        latitude: location?.coords.latitude || 32.0853,
                        longitude: location?.coords.longitude || 34.7818,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    }}
                >

                    {place_latitude !== 0 && (
                        <Marker
                            coordinate={{
                                latitude: place_latitude,
                                longitude: place_longitude,
                            }}
                            title="Destination"
                            description={searchQuery}
                        />
                    )}

                    {route_coordinates?.length && show_route && (
                        <Polyline
                            coordinates={route_coordinates}
                            strokeColor="#3B82F6"
                            strokeWidth={4}
                            lineCap="round"            // THIS turns the squares into circles
                            lineJoin="round"
                            lineDashPattern={[8, 15]} // 10px line, 10px gap
                            // Remove lineCap="round" for sharp dashes
                        />
                    )}
                </MapView>
                {map_Moved && (
                    <TouchableOpacity
                        onPress={() => {
                            returnToStartingPoint();
                            setMapMoved(false);
                        }}
                        // 'absolute' is the key: it pulls it out of the stack and puts it ON the map
                        // 'bottom-5' and 'right-5' push it 20px away from the edges
                        style={{
                            position: 'absolute',
                            bottom: 20,
                            right: 20,
                            zIndex: 100 // Force it to stay on top
                        }}
                    >
                        <Image
                            source={require('../assets/images/MoveToCurrentLocation.png')}
                            style={{width: 50, height: 50}}
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                )}

            </View>
            {userChooseAdress && (
                <TouchableOpacity
                    onPress={() => {
                        GetPlaceRoute();
                        setShowRoute(true);
                        returnToStartingPoint();
                        setShowSearchingBar(false);
                        setUserChooseAdress(false);
                    }}
                    className="mx-auto h-[50] w-[150] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg ml-10 mt-5"
                >
                    {loading ? <ActivityIndicator color="white"/> :
                        <Text className="text-white font-bold text-lg">Route</Text>}
                </TouchableOpacity>
            )}

            {show_route && (
                <TouchableOpacity
                    onPress={() => {
                        setShowRoute(false);
                        returnToStartingPoint();
                        setShowSearchingBar(true);
                    }}
                    className="mx-auto h-[50] w-[150] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg ml-10 mt-5"
                >
                    {loading ? <ActivityIndicator color="white"/> :
                        <Text className="text-white font-bold text-lg">Stop Route</Text>}
                </TouchableOpacity>
            )}

        </View>
    );
}