import {
    Dimensions,
    View,
    ActivityIndicator,
    Text,
    TouchableOpacity,
    TextInput,
    Keyboard,
    Image,
    Alert,
    Switch,
    StyleSheet, Modal, SafeAreaView, FlatList
} from 'react-native';
import MapView, {PROVIDER_GOOGLE, Marker, Polyline} from 'react-native-maps';
import React, {useEffect, useRef, useState} from 'react';
import * as Location from 'expo-location'; //
import {Ionicons} from '@expo/vector-icons';
import polyline from '@mapbox/polyline';
import {router, Tabs} from "expo-router";
import { useMemories } from '../../context/MemoryContext';
import { Memory } from '../../context/MemoryContext';
import { useMapLogic } from '../../hooks/useMapLogic';
import {inspect} from "node:util";
import { useAuth } from '../../context/AuthContext';

const darkMapStyle = [
    {
        "featureType": "all",
        "elementType": "all",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels",
        "stylers": [
            {
                "color": "white",
                "visibility": "on"
            },
            {
                "saturation": "-100"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "saturation": 36
            },
            {
                "color": "#000000"
            },
            {
                "lightness": 40
            },
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "color": "white",
                "visibility": "on"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 17
            },
            {
                "weight": 1.2
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "landscape.natural",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
            {
                "lightness": 21
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
            {
                "visibility": "on"
            },
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#7f8d89"
            },
            {
                "lightness": 29
            },
            {
                "weight": 0.2
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 18
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "transit",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 19
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "all",
        "stylers": [
            {
                "color": "#2b3638"
            },
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#2b3638"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#24282b"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#24282b"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    }
];


export default function MapScreen() {
    const { memories, deleteMemory} = useMemories();
    const auth = useAuth();

    const {
        mapRef, location, loading, searchQuery, google_result,
        destination_latitue, destination_longtitude, route_coordinates,
        show_route, show_SearchingBar, map_Moved, userChooseAdress, routeDistance,showMemories,isGalleryVisible,
        setSearchQuery, setMapMoved, fetchPlaces, handleSelectPlace,
        GetPlaceRoute, handleMarkerPress, handleStopRoute, returnToStartingPoint,
        setShowRoute, setShowSearchingBar, setUserChooseAdress, setRouteDistance , setDestinationlongtitude, setDestinationlatitue,setShowMemories,setIsGalleryVisible,
        jumpToLocation,
    } = useMapLogic(deleteMemory);

    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isMenuVisible, setIsMenuVisible] = useState(false);

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

    return (
        <View className="flex-1 items-center bg-slate-50">

            <TouchableOpacity
                onPress={() => setIsMenuVisible(true)}
                style={localStyles.menuButton}
            >
                <Ionicons name="menu" size={30} color="#3B82F6" />
            </TouchableOpacity>

            <Modal
                animationType="slide"     // Makes it slide up from the bottom
                transparent={true}        // Allows us to see the dimmed map behind it
                visible={isMenuVisible}
                onRequestClose={() => setIsMenuVisible(false)} // Handles the hardware back button on Android
            >
                <View style={localStyles.modalOverlay}>
                    <View style={localStyles.menuContent}>

                        {/* Header: Title and Close Button */}
                        <View style={localStyles.menuHeader}>
                            <Text style={localStyles.menuTitle}>Settings</Text>
                            <TouchableOpacity onPress={() => setIsMenuVisible(false)}>
                                <Ionicons name="close-circle" size={30} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        {/* Dark Mode Row */}
                        <View style={localStyles.menuRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Ionicons name={isDarkMode ? "moon" : "sunny"} size={24} color="#735e21" />
                                <Text style={localStyles.menuText}>Dark Mode</Text>
                            </View>
                            <Switch
                                trackColor={{ false: "#767577", true: "#735e21" }}
                                thumbColor="#f4f3f4"
                                onValueChange={() => setIsDarkMode(prev => !prev)}
                                value={isDarkMode}
                            />
                        </View>

                        <View style={localStyles.menuRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Ionicons name={"image"} size={24} color="#228B22" />
                                <Text style={localStyles.menuText}>Memo Saves</Text>
                            </View>
                            <Switch
                                trackColor={{ false: "#767577", true: "#735e21" }}
                                thumbColor="#f4f3f4"
                                onValueChange={() => setShowMemories(previousState => !previousState)}
                                value={showMemories}
                            />
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                setIsMenuVisible(false); // 1. Close the Settings Menu first

                                // 2. Wait for the slide-down animation to finish
                                setTimeout(() => {
                                    setIsGalleryVisible(true); // 3. Now open the Gallery!
                                }, 400); // 400ms is usually the sweet spot for modal transitions
                            }}
                            style={localStyles.menuRow}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Ionicons name="images" size={24} color="#065F46" />
                                <Text style={localStyles.menuText}>Memo Pics</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>

                        {/*Log out button*/}
                        <TouchableOpacity
                            style={localStyles.menuRow}
                            onPress={() => {
                                auth.logout();
                                setIsMenuVisible(false);
                                router.replace('/');
                            }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12}}>
                                <Ionicons name="log-out-outline" size={24} color="#ef4444" />
                                <Text style={localStyles.menuText}>Logout</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Future Placeholder: We can add 'Logout' here later! */}
                        <TouchableOpacity
                            style={[localStyles.menuRow, { borderBottomWidth: 0 }]}
                            onPress={() => alert("Coming soon: Account settings and Logout!")}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Ionicons name="person-circle-outline" size={24} color="#3B82F6" />
                                <Text style={localStyles.menuText}>Account</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                        </TouchableOpacity>

                    </View>
                </View>
            </Modal>

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
            <View className="  h-full w-full rounded-3xl overflow-hidden shadow-lg border-white  ">

                <MapView

                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    customMapStyle={isDarkMode ? darkMapStyle : []}
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

                    {/* 1. SEARCH DESTINATION MARKER */}
                    {destination_latitue !== 0 && userChooseAdress && (
                        <Marker
                            coordinate={{
                                latitude: destination_latitue,
                                longitude: destination_longtitude,
                            }}
                            title="Destination"
                            description={searchQuery}
                        />
                    )}

                    {showMemories && memories.map((memory, index) => {
                        const rotation = (index % 2 === 0 ? 2 : -2);

                        // Fallback logic for the date
                        const displayDate = memory.created_at
                            ? new Date(memory.created_at).toLocaleDateString()
                            : new Date().toLocaleDateString();

                        return (
                            <Marker
                                key={memory.id}
                                coordinate={{
                                    latitude: memory.latitude,
                                    longitude: memory.longitude,
                                }}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    handleMarkerPress(memory);
                                }}
                            >
                                <TouchableOpacity
                                    onLongPress={() => handleMarkerPress(memory)}
                                    delayLongPress={500}
                                    activeOpacity={0.8}
                                >
                                    <View
                                        style={{
                                            transform: [{ rotate: `${rotation}deg` }],
                                            shadowColor: "#000",
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 4,
                                            elevation: 5,
                                        }}
                                        className="p-1 pb-4 bg-white border border-gray-200"
                                    >
                                        <Image
                                            source={{ uri: memory.uri }}
                                            className="w-14 h-14 bg-gray-100"
                                            resizeMode="cover"
                                        />
                                    </View>
                                </TouchableOpacity>
                            </Marker>
                        );
                    })}

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


                {/* LEFT SIDE FLOATING BUTTONS */}
                <View style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 100 }}>
                    {userChooseAdress && !show_route && (
                        <TouchableOpacity
                            onPress={() => {
                                GetPlaceRoute();
                                setShowRoute(true);
                                returnToStartingPoint();
                                setShowSearchingBar(false);
                            }}
                            className="h-[40px] w-[100px] bg-blue-600 rounded-2xl items-center justify-center shadow-lg"
                        >
                            <Text className="text-white font-bold text-lg">Route</Text>
                        </TouchableOpacity>
                    )}

                    {show_route && (
                        <TouchableOpacity
                            onPress={() => {
                                setShowRoute(false);
                                returnToStartingPoint();
                                setShowSearchingBar(true);
                                setRouteDistance('');
                                setDestinationlatitue(0);
                                setDestinationlongtitude(0);
                                setUserChooseAdress(false);
                                setSearchQuery('');
                            }}
                            className="h-[40px] w-[100px] bg-red-500 rounded-2xl items-center justify-center shadow-lg"
                        >
                            <Text className="text-white font-bold text-lg">Stop</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {routeDistance ? (
                    <View style={{ position: 'absolute', bottom: 80, left: 30, zIndex: 100 }}>
                        <View className="h-[45px] w-[150px] bg-white p-3 rounded-3xl shadow-sm border border-slate-100 items-center justify-center">
                            <Text className="text-slate-600 font-bold">🚶 {routeDistance} walk</Text>
                        </View>
                    </View>
                ) : null}

                {/* RIGHT SIDE RECENTER BUTTON */}
                {map_Moved && (
                    <TouchableOpacity
                        onPress={() => {
                            returnToStartingPoint();
                            setMapMoved(false);
                        }}
                        style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 100 }}
                    >
                        <Image
                            source={require('../../assets/images/BackHome.png')}
                            style={{width: 50, height: 50}}
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                )}
            </View>

            <Modal
                animationType="slide"
                transparent={false}
                visible={isGalleryVisible}
                onRequestClose={() => setIsGalleryVisible(false)}
            >
                <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
                    {/* Header */}
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        padding: 20,
                        alignItems: 'center',
                        borderBottomWidth: 1,
                        borderBottomColor: '#eee'
                    }}>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#065F46' }}>My Memos</Text>
                        <TouchableOpacity onPress={() => setIsGalleryVisible(false)}>
                            <Ionicons name="close-circle" size={32} color="#767577" />
                        </TouchableOpacity>
                    </View>

                    {/* The Grid Gallery */}
                    <FlatList
                        data={memories}
                        numColumns={3} // 3 pics per row as requested
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ padding: 10 }}
                        renderItem={({ item, index }) => {
                            const rotation = (index % 2 === 0 ? 1 : -1) * 2;
                            return (
                                <TouchableOpacity
                                    onPress={() => jumpToLocation(item.latitude, item.longitude)}
                                    style={{ flex: 1/3, padding: 8 }}
                                >
                                    <View style={{transform: [{ rotate: `${rotation}deg` }], backgroundColor: 'white', padding: 4, paddingBottom: 12, shadowColor: "#000",
                                        shadowOpacity: 0.1,
                                        elevation: 3,
                                    }}>
                                        <Image
                                            source={{ uri: item.uri }}
                                            style={{ width: '100%', aspectRatio: 1 }}
                                            resizeMode="cover"
                                        />
                                        <Text style={{ fontSize: 6, color: '#c2410c', textAlign: 'center', marginTop: 4 }}>
                                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </SafeAreaView>
            </Modal>

        </View>
    );
}


const styles = StyleSheet.create({
    toggleContainer: {
        position: 'absolute', // This floats it on top of the map
        top: 50,              // Adjust based on your phone's notch/header
        right: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.8)', // Semi-transparent
        padding: 10,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.3,
    }
});

const localStyles = StyleSheet.create({
    menuButton: {
        position: 'absolute',
        top: 70,
        right: 18, // Opposite side of the search bar or toggle
        backgroundColor: 'white',
        padding: 8,
        borderRadius: 12,
        elevation: 10,
        zIndex: 1000,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end', // This makes it slide up from the bottom
        backgroundColor: 'rgba(0,0,0,0.4)', // Dim the background
    },
    menuContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 25,
        paddingBottom: 50,
        minHeight: 250,
    },
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    menuTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    menuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    menuText: {
        fontSize: 16,
        color: '#334155',
        fontWeight: '500',
    }
});