import { MapClusterMarker, MapMemoryMarker } from '@/components/map/MapMemoryMarker';
import type { MapMarkerItem, MapPinCluster } from '@/lib/mapMemoryPins';
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
        if (item.type === 'cluster') {
            return (
                <MapClusterMarker
                    key={markerItemKey(item)}
                    cluster={item.cluster}
                    onPress={onClusterPress}
                />
            );
        }
        return (
            <MapMemoryMarker
                key={markerItemKey(item)}
                memory={item.pin.memory}
                variant={item.pin.variant}
                onMarkerPress={onMarkerPress}
            />
        );
    });
}

export default React.memo(MapMemoryMarkerList);
