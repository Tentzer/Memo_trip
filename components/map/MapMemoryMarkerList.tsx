import { MapClusterMarker, MapMemoryMarker } from '@/components/map/MapMemoryMarker';
import type { MapMarkerItem, MapPinCluster } from '@/lib/mapMemoryPins';
import type { Memory } from '@/types/memory';

type MapMemoryMarkerListProps = {
    items: MapMarkerItem[];
    onMarkerPress: (memory: Memory) => void;
    onClusterPress: (cluster: MapPinCluster) => void;
};

export default function MapMemoryMarkerList({
    items,
    onMarkerPress,
    onClusterPress,
}: MapMemoryMarkerListProps) {
    return (
        <>
            {items.map((item) => {
                if (item.type === 'cluster') {
                    return (
                        <MapClusterMarker
                            key={item.cluster.id}
                            cluster={item.cluster}
                            onPress={onClusterPress}
                        />
                    );
                }
                return (
                    <MapMemoryMarker
                        key={`${item.pin.variant}:${item.pin.memory.id}`}
                        memory={item.pin.memory}
                        variant={item.pin.variant}
                        onMarkerPress={onMarkerPress}
                    />
                );
            })}
        </>
    );
}
