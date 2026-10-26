import { supabase } from '@/lib/supabase';

/** Upload a JPEG into the `memories` bucket and return its public URL. */
export async function uploadMemoryJpeg(fileName: string, localUri: string): Promise<string> {
    const response = await fetch(localUri);
    if (!response.ok) {
        throw new Error(`Could not read image for upload (${response.status}).`);
    }
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage.from('memories').upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
    });
    if (error) throw error;
    const { data } = supabase.storage.from('memories').getPublicUrl(fileName);
    return data.publicUrl;
}
