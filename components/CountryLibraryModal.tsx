import type { ComponentProps } from 'react';
import LibraryModal from '@/components/LibraryModal';

export default function CountryLibraryModal(
    props: Omit<ComponentProps<typeof LibraryModal>, 'variant'>
) {
    return <LibraryModal {...props} variant="countries" />;
}
