import { MapClusterMarker, MapMemoryMarker } from '@/components/map/MapMemoryMarker';
import { pinImageUri, type MapMarkerItem, type MapPinCluster } from '@/lib/mapMemoryPins';
import { markerItemKey } from '@/lib/visibleMapMarkers';
import type { Memory } from '@/types/memory';
import React from 'react';

type MapMemoryMarkerListProps = {
    items: MapMarkerItem[];
    onMarkerPress: (memory: Memory) => void;
    onClusterPress: (cluster: MapPinCluster) => void;
};

function MapMemoryMarkerList({
    items,
    onMarkerPress,
    onClusterPress,
}: MapMemoryMarkerListProps) {
    return items.map((item) => {
        const image = item.type === 'cluster'
            ? pinImageUri(item.cluster.newest.memory)
            : pinImageUri(item.pin.memory);
        const key = `${markerItemKey(item)}:${image}`;
        if (item.type === 'cluster') {
            return (
                <MapClusterMarker
                    key={key}
                    cluster={item.cluster}
                    onPress={onClusterPress}
                />
            );
        }
        return (
            <MapMemoryMarker
                key={key}
                memory={item.pin.memory}
                variant={item.pin.variant}
                onMarkerPress={onMarkerPress}
            />
        );
    });
}

export default React.memo(MapMemoryMarkerList);
